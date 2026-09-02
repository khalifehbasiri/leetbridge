# Security Policy

## Reporting a vulnerability

Please do not disclose a suspected vulnerability in a public issue.

Use GitHub's private vulnerability reporting for this repository:

https://github.com/khalifehbasiri/leetbridge/security/advisories/new

Include the affected version, reproduction steps, expected impact, and any
suggested mitigation. Please allow a reasonable period for investigation and
remediation before public disclosure.

## Security model

- LeetBridge requests access only to LeetCode problem pages and GitHub.
- The GitHub App requests repository Contents permission and users choose the
  repositories it can access. Contents permission applies to the whole selected
  repository, so users should choose a dedicated solutions repository.
- The extension contains a public GitHub client ID and app slug. It does not
  contain a client secret, private key, personal access token, or developer
  GitHub credential.
- User access and refresh tokens stay in local Chrome extension storage,
  restricted to trusted extension contexts. Chrome extension storage is not
  an encrypted secret vault, so a compromised operating-system account or
  browser profile may still expose locally stored data.
- LeetBridge uses HTTPS for GitHub authentication and API requests.

Users should authorize only device-flow requests they initiated themselves and
should review the displayed time and location before approving the request.
