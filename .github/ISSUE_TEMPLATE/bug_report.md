---
name: Bug Report
about: Create a detailed bug report to help improve system reliability
title: "[Component][Error Code] Brief description of the bug"
labels: bug
assignees: ''
---

## Bug Description
**Expected Behavior**
<!-- Describe what should happen -->

**Actual Behavior**
<!-- Describe what actually happens -->

**Impact Severity**
- [ ] Critical - System down, data loss, security breach (15min response)
- [ ] High - Major functionality broken (1hr response)
- [ ] Medium - Feature partially broken (4hr response)
- [ ] Low - Minor issue (24hr response)

**System Reliability Impact**
- Uptime Impact (%): 
- Error Rate Increase (%): 
- Affected Users Count: 
- Performance Degradation: 

**Error Code Reference**
<!-- Select the relevant error code -->
- [ ] E1001 - Rate limit exceeded (Backend)
- [ ] E1002 - Proxy failure (Infrastructure)
- [ ] E1003 - Parser error (Backend)
- [ ] E1004 - Authentication failure (Security)
- [ ] E1005 - Network timeout (Infrastructure)
- [ ] E1006 - Data validation error (Backend)
- [ ] E1007 - Storage failure (Infrastructure)

## Steps to Reproduce
1. 
2. 
3. 

## Environment Details
**Application Version:**
<!-- Specify the version number -->

**Deployment Environment:**
- [ ] Production
- [ ] Staging
- [ ] Development

**Infrastructure Configuration:**
<!-- Provide relevant infrastructure details -->

**OS/Browser Version:**
<!-- For UI-related issues -->

**Related Services Status:**
<!-- List status of dependent services -->

**Recent System Changes:**
<!-- Note any recent deployments or configuration changes -->

## Error Details
**Error Code:**
```
<!-- Insert error code -->
```

**Stack Trace:**
```
<!-- Insert stack trace -->
```

**System Metrics:**
```
<!-- Insert relevant metrics -->
```

## Logs and Screenshots
<!-- Attach the following (supported formats: txt, log, png, jpg, json, metrics) -->
- [ ] Application Logs
- [ ] System Metrics
- [ ] Performance Data
- [ ] Screenshots (if applicable)

## Additional Labels
<!-- Check all that apply -->
- [ ] backend
- [ ] frontend
- [ ] infrastructure
- [ ] security
- [ ] ui/ux
- [ ] documentation
- [ ] performance
- [ ] scalability
- [ ] reliability
- [ ] data-quality

## Auto-Assignment Reference
Backend Issues (E1001-E1003): @backend-team
Frontend Issues (E1004): @frontend-team
Infrastructure Issues (E1005, E1007): @devops-team
Security Issues (E1006): @security-team

---
<!-- 
This bug report template is designed to support the system's 99.9% uptime and <0.1% error rate goals.
Please provide as much detail as possible to ensure quick resolution.
-->