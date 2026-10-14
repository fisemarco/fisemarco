# FTAI builder integrations

Start at [/connect](/connect): copy one setup instruction or read [/llm-start.md](/llm-start.md). Call `ftai_builder_setup` after connecting.

## Codex and ChatGPT

FTAI publishes a hosted MCP server at `/mcp`. Sites provisions its associated personal plugin after deployment. In the owner's Plugins → Personal → Created by you, open FTAI and choose Install or Connect. Connection permissions apply per user; installing does not grant access to other organisations. Public-directory distribution is a separate platform submission, not accomplished by hosting.

The hosted connection includes personalised builder setup, organisation creation/listing, owned passport listing and assignment, paginated signed trust graphs, live technical assessment, certificate issuance/status/revocation, delegation handshakes and public summary search. Discovery is public; data-bearing tool calls require the hosting-authenticated user. Private keys never enter MCP tool arguments.

Version 3.0.1 adds Intelligence Control management: versioned policy reads/edits/restoration, capability candidates/version history/promotion/withdrawal, recurring pattern suggestions, execution-attempt metrics and paginated individual traces. There are 21 tools. The existing hosted endpoint and personal plugin are reused; server updates arrive through the same connection. If a client retains an old tool catalogue, refresh the connection's tools or reconnect it. Call `ftai_builder_setup` to check `pluginVersion` and `availableTools`. This does not change plugin permissions or authenticate a different account. Full tool descriptions and examples: [/plugin-guide.md](/plugin-guide.md).

## Claude Code

Download `/integrations/ftai-claude.zip`, extract it, then load the `ftai` directory using Claude Code's `--plugin-dir` option. The package contains `.claude-plugin/plugin.json`, a remote HTTP MCP connection and an FTAI integration skill. Use the client's MCP connection UI to authenticate. Hosting OAuth availability and allowed clients remain controlled by the hosting provider; if that client cannot authenticate, use the SDK integration below. FTAI does not bypass the hosting boundary. This package does not imply Claude marketplace listing or a completed external-client login test.

## Other clients and model frameworks

MCP-capable clients can connect to the streamable HTTP `/mcp` endpoint if they support the host's OAuth flow. Other clients use the public runtime SDK or signed HTTP API. Model weights do not install plugins; integration occurs in the application hosting the model. There is no universal native plugin format for every model.

Existing runtime agents retain `/api/mcp`, with audience-bound machine tokens and private_key_jwt; it is distinct from the builder-facing `/mcp` user connection. Never substitute a runtime token for a human organisation identity.

## Agent startup contract

1. Builder authorises the runtime and configures its enrollment policy in `/builders`.
2. Store the enrollment key in runtime secrets and SDK state on durable private storage.
3. Await `FTAIClient.init()` before accepting work. Restarts reuse the existing identity.
4. Missing configuration raises FTAI_ENROLLMENT_REQUIRED with the builder setup URL.
5. For organisation-assigned agents, use runAuthorizedTask, exact task inputs and live resource controls. Honour cancellation and persist outcome recovery.
6. Test denial and revocation before using production resources.

Enrollment is voluntary for unconnected platforms. The integration can make identity a startup requirement in participating applications; it cannot force external platforms or agents to enroll.
