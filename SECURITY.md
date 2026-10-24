# Security Policy

## PDF Master Studio

PDF Master Studio is a desktop PDF editing and document management application for Linux and Windows. It includes PDF processing features and supports local AI-powered summarisation through `llama.cpp`.

We take application security, document privacy, and responsible vulnerability disclosure seriously.

## Supported Versions

Security updates are provided for actively maintained releases of PDF Master Studio.

| Version | Supported |
|---|---|
| 3.x.x | :white_check_mark: |
| Older or unsupported releases | :x: |

**Note:** Update this table if your actual release and maintenance policy differs.

## Reporting a Vulnerability

If you discover a potential security vulnerability in PDF Master Studio, please report it responsibly.

### How to Report

- **GitHub:** Open a private security advisory through the repository's Security tab, if GitHub Private Vulnerability Reporting is enabled.
- **Email:** Contact the project maintainer using the security contact address published in the repository or project website.

Please do not disclose exploitable vulnerabilities publicly before the issue has been assessed and, where appropriate, a fix has been released.

### Include the Following Information

When reporting a vulnerability, please provide:

- A clear description of the vulnerability.
- The affected application version and operating system.
- Steps to reproduce the issue.
- The potential security impact.
- Proof-of-concept details or screenshots, if safe to share.
- Any suggested mitigation or fix.

Please avoid including real personal information, confidential documents, passwords, or sensitive PDF files in your report.

## Response and Resolution

We aim to follow these guidelines when handling security reports:

- **Acknowledgement:** Within 7 calendar days of receiving a report.
- **Initial assessment:** We will investigate the report and determine its potential impact.
- **Status updates:** We will provide updates as the investigation progresses.
- **Accepted vulnerabilities:** We will work toward a fix and release a security update as appropriate.
- **Declined reports:** We will explain the decision when reasonably possible, including if the issue cannot be reproduced or is outside the project's security scope.

Response times are targets, not guarantees. Resolution time depends on severity, complexity, and the availability of a reliable fix.

## Security Considerations

### PDF File Processing

PDF Master Studio processes potentially untrusted documents. Users should only open files from trusted sources when possible and keep the application and its PDF-processing dependencies updated.

### Local AI and llama.cpp

PDF Master Studio supports local AI summarisation using `llama.cpp`.

- Local inference can reduce the need to send document content to external AI services.
- Privacy depends on the configured model, server endpoint, application settings, and any additional integrations.
- Users should verify that their local AI server is appropriately secured and is not unintentionally exposed to untrusted networks.
- Do not assume that every AI workflow is offline unless its configuration has been verified.

### Third-Party Dependencies

PDF Master Studio relies on third-party libraries and components. We recommend keeping dependencies updated and addressing relevant security advisories.

### Data Privacy

Users should avoid sharing sensitive documents, personal information, or confidential data when reporting issues. Local processing does not automatically guarantee that every application component or integration operates exclusively on the device.

## Scope

Security reports may include, but are not limited to:

- Arbitrary code execution.
- PDF parsing or document-processing vulnerabilities.
- Local file access or unintended data disclosure.
- Authentication or access-control weaknesses, where applicable.
- Insecure API communication or unintended network exposure.
- Vulnerabilities involving local AI server integration.
- Vulnerable dependencies affecting PDF Master Studio.

Reports concerning unsupported versions may be considered, but fixes are not guaranteed.

## Responsible Disclosure

We appreciate security researchers and users who help improve PDF Master Studio. Please allow reasonable time for investigation and remediation before publicly disclosing an unpatched vulnerability.

We do not authorize unauthorized access to systems, data, or services. Security testing should be limited to systems you own or have explicit permission to test.

Thank you for helping keep PDF Master Studio and its users secure.
