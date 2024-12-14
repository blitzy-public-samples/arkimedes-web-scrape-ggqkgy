"""
Playwright-based browser automation module for high-performance web scraping.
Implements concurrent browser contexts, efficient page management, and comprehensive error handling.

Version: 1.38.0 (Playwright)
"""

import asyncio
from typing import Dict, List, Any, Optional
from playwright.async_api import Browser, BrowserContext, Page, Error as PlaywrightError
import playwright.async_api as pw

from ...utils.retry import AsyncRetry
from ...utils.logging import get_logger

# Default browser configuration
DEFAULT_VIEWPORT = {"width": 1920, "height": 1080}
DEFAULT_TIMEOUT = 30000  # 30 seconds
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
)

class PlaywrightBrowser:
    """
    High-level wrapper for Playwright browser instance providing concurrent context management,
    efficient page handling, and automated resource cleanup.
    """

    def __init__(self, browser: Browser, config: Dict[str, Any]) -> None:
        """
        Initialize Playwright browser wrapper with configuration.

        Args:
            browser: Playwright browser instance
            config: Browser configuration dictionary
        """
        self._browser = browser
        self._config = config
        self._logger = get_logger(
            __name__,
            {"component": "PlaywrightBrowser", "browser_type": browser.browser_type.name}
        )
        self._contexts: List[BrowserContext] = []
        self._context_locks: Dict[str, asyncio.Lock] = {}
        self._cleanup_lock = asyncio.Lock()

        # Log initialization
        self._logger.info(
            "Initialized PlaywrightBrowser",
            extra={
                "browser_type": browser.browser_type.name,
                "config": {k: v for k, v in config.items() if not isinstance(v, (bytes, memoryview))}
            }
        )

    @AsyncRetry(max_retries=3, exceptions=(PlaywrightError,))
    async def create_context(self, context_options: Dict[str, Any]) -> BrowserContext:
        """
        Create and configure a new browser context with specified options.

        Args:
            context_options: Configuration options for the browser context

        Returns:
            Configured browser context

        Raises:
            PlaywrightError: If context creation fails
        """
        try:
            # Merge default and custom options
            merged_options = {
                "viewport": DEFAULT_VIEWPORT,
                "user_agent": DEFAULT_USER_AGENT,
                "ignore_https_errors": True,
                "java_script_enabled": True,
                "bypass_csp": True,
                **context_options
            }

            # Create context with merged options
            context = await self._browser.new_context(**merged_options)

            # Configure context-wide settings
            await context.set_default_timeout(
                context_options.get("timeout", DEFAULT_TIMEOUT)
            )
            await context.set_default_navigation_timeout(
                context_options.get("navigation_timeout", DEFAULT_TIMEOUT)
            )

            # Setup request/response handling
            await context.route("**/*", self._handle_route)
            context.on("requestfailed", self._handle_request_failure)
            context.on("response", self._handle_response)

            # Track context and create lock
            self._contexts.append(context)
            context_id = str(id(context))
            self._context_locks[context_id] = asyncio.Lock()

            self._logger.info(
                "Created browser context",
                extra={
                    "context_id": context_id,
                    "options": merged_options
                }
            )

            return context

        except PlaywrightError as e:
            self._logger.error(
                "Failed to create browser context",
                extra={"error": str(e), "options": context_options},
                exc_info=True
            )
            raise

    @AsyncRetry(max_retries=3, exceptions=(PlaywrightError,))
    async def new_page(self, context: BrowserContext, page_options: Dict[str, Any]) -> Page:
        """
        Create and configure a new page within specified context.

        Args:
            context: Browser context to create page in
            page_options: Configuration options for the page

        Returns:
            Configured page instance

        Raises:
            PlaywrightError: If page creation fails
        """
        context_id = str(id(context))
        async with self._context_locks[context_id]:
            try:
                # Create new page
                page = await context.new_page()

                # Configure page settings
                await page.set_viewport_size(
                    page_options.get("viewport", DEFAULT_VIEWPORT)
                )
                await page.set_extra_http_headers(
                    page_options.get("headers", {})
                )

                # Setup page event handlers
                page.on("console", self._handle_console)
                page.on("pageerror", self._handle_page_error)
                page.on("crash", self._handle_crash)

                # Configure resource handling
                await page.route("**/*", self._handle_route)

                self._logger.info(
                    "Created new page",
                    extra={
                        "context_id": context_id,
                        "page_id": str(id(page)),
                        "options": page_options
                    }
                )

                return page

            except PlaywrightError as e:
                self._logger.error(
                    "Failed to create page",
                    extra={
                        "context_id": context_id,
                        "error": str(e),
                        "options": page_options
                    },
                    exc_info=True
                )
                raise

    async def cleanup(self) -> None:
        """
        Perform comprehensive cleanup of browser resources.
        """
        async with self._cleanup_lock:
            try:
                # Close all contexts
                for context in self._contexts:
                    try:
                        await context.close()
                        self._logger.info(
                            "Closed browser context",
                            extra={"context_id": str(id(context))}
                        )
                    except PlaywrightError as e:
                        self._logger.warning(
                            "Error closing browser context",
                            extra={"context_id": str(id(context)), "error": str(e)}
                        )

                # Clear tracking containers
                self._contexts.clear()
                self._context_locks.clear()

                self._logger.info("Completed browser cleanup")

            except Exception as e:
                self._logger.error(
                    "Error during browser cleanup",
                    extra={"error": str(e)},
                    exc_info=True
                )
                raise

    async def _handle_route(self, route: pw.Route) -> None:
        """Handle network routes for resource optimization."""
        if route.request.resource_type in self._config.get("block_resources", []):
            await route.abort()
        else:
            await route.continue_()

    async def _handle_request_failure(self, request: pw.Request) -> None:
        """Handle and log failed requests."""
        self._logger.warning(
            "Request failed",
            extra={
                "url": request.url,
                "method": request.method,
                "failure": request.failure
            }
        )

    async def _handle_response(self, response: pw.Response) -> None:
        """Handle and monitor responses."""
        if response.status >= 400:
            self._logger.warning(
                "Received error response",
                extra={
                    "url": response.url,
                    "status": response.status,
                    "status_text": response.status_text
                }
            )

    def _handle_console(self, msg: pw.ConsoleMessage) -> None:
        """Handle console messages from pages."""
        if msg.type == "error":
            self._logger.warning(
                "Browser console error",
                extra={"text": msg.text, "location": msg.location}
            )

    def _handle_page_error(self, error: pw.Error) -> None:
        """Handle page-level errors."""
        self._logger.error(
            "Page error occurred",
            extra={"error": str(error)},
            exc_info=True
        )

    def _handle_crash(self, page: pw.Page) -> None:
        """Handle page crashes."""
        self._logger.error(
            "Page crashed",
            extra={"page_id": str(id(page))}
        )

# Export public interface
__all__ = ['PlaywrightBrowser']