# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT open a public issue** for security vulnerabilities
2. Use GitHub's private vulnerability reporting on the codec repository: https://github.com/B67687/ithmb-codec/security/advisories/new
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 1 week
- **Fix or mitigation**: Depends on severity, typically within 2 weeks for critical issues

## Security Considerations

This project processes `.ithmb` files entirely in-browser using WebAssembly. Key security properties:

- **No server-side decoding**: All decoding happens client-side in the browser
- **No uploads**: File contents never leave the user's machine. The website has no contribution endpoint and makes no file-sending requests. The only runtime fetches are same-origin assets.
- **WASM sandbox**: The decoder runs in a WebAssembly sandbox with no access to the filesystem or network
- **Input validation**: The decoder validates file headers and bounds before processing

## Scope

This security policy covers:
- The web application at ithmb-codec.dev
- The WASM decoder module

This policy does NOT cover:
- Third-party dependencies (report upstream)
- The Ithmb-Codec Rust library (separate project)
