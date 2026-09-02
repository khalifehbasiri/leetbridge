# LeetBridge Privacy Policy

Effective: September 2, 2026

LeetBridge has one purpose: capture a user's accepted LeetCode solution and
save it to a GitHub repository selected by that user.

## Data LeetBridge handles

While a user is on a LeetCode problem page, LeetBridge may process:

- the LeetCode username shown on the page;
- problem number, title, slug, and difficulty;
- submission status and programming language; and
- the source code submitted by the user.

If the user starts a historical import, LeetBridge also reads the user's
authenticated LeetCode submission history to find the latest accepted
solution for each problem and language. Earlier duplicate submissions are not
sent to GitHub.

To resume interrupted imports, the extension stores a local checkpoint with
the LeetCode username, pagination position, processed problem/language
identifiers, and any retry cooldown. It removes the checkpoint when the import
finishes, when a new import replaces it, or when GitHub is disconnected.

When a user connects GitHub, LeetBridge also processes:

- the repositories made available to the LeetBridge GitHub App;
- the repository selected by the user; and
- GitHub access and refresh tokens issued after authorization.

## How the data is used

LeetBridge uses this data only to display submission information in the
extension and sync an accepted solution to the selected GitHub repository.
The extension does not include advertising or analytics.

Accepted source code and the related problem information are sent directly
from the browser to GitHub over HTTPS. LeetBridge does not operate a developer
server that receives or stores this data.

## Local storage and retention

Current problem data, settings, import progress, recently synced submission
IDs, the selected repository, the last sync result, and GitHub authorization
tokens are stored in Chrome's extension storage on the user's device.
Extension storage is restricted to trusted extension pages and the background
service worker. The extension does not keep a separate local archive of every
accepted solution.

Disconnecting GitHub removes the locally stored GitHub tokens, repository
selection, and last sync result. Removing the extension clears its remaining
Chrome extension storage. Files already synced to GitHub remain in the user's
repository until the user edits or deletes them there.

## Sharing

LeetBridge sends data only to GitHub as required to authenticate the user,
list repositories the user granted to LeetBridge, and write accepted solution
files. LeetBridge does not sell user data or share it with advertisers, data
brokers, or analytics providers.

GitHub and LeetCode process data under their own terms and privacy policies.

## Limited use

LeetBridge's use of information received from users complies with the Chrome
Web Store User Data Policy, including the Limited Use requirements. LeetBridge
uses and transfers user data only to provide its stated solution-syncing
functionality. It does not sell user data, use it for advertising or credit
decisions, or allow humans to read it. LeetBridge has no developer-operated
backend that receives accepted source code or GitHub credentials.

## User choices

Users control which repository LeetBridge can access through the GitHub App
installation settings. They can disconnect inside LeetBridge, revoke the
authorization or installation in GitHub settings, delete synced files from
their repository, or remove the extension from Chrome.

GitHub grants Contents permission at repository level rather than folder level.
Users should select a dedicated solutions repository to limit access.

## Changes

Material changes to these practices will be reflected in this policy and in
the Chrome Web Store disclosures before an updated version is released.

## Contact

Questions about this policy may be opened as an issue in the LeetBridge GitHub
repository. Security vulnerabilities should be reported privately as
described in `SECURITY.md`.
