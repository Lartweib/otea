# Security

Please report a security problem privately, never in a public issue, discussion or pull request.

Report it through GitHub's private vulnerability reporting: on [this repository](https://github.com/Lartweib/otea), open the **Security** tab and choose **Report a vulnerability**. Only you and the repository's maintainers see the report until a fix is out.

Say what you found, how to reproduce it and what it lets someone do. Otea has had no release yet, so name the commit you built from (`git rev-parse --short HEAD` in your checkout): fixes land on `main`.

This covers the CLI, the MCP server, `otea serve` (its sign-in, phone pairing and transports) and the desktop app.
