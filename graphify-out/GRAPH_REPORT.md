# Graph Report - claude_code_demo  (2026-09-25)

## Corpus Check
- Corpus is ~25,624 words - fits in a single context window. You may not need a graph.

## Summary
- 259 nodes · 383 edges · 15 communities (11 shown, 4 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.83)
- Token cost: 235,085 input · 0 output

## Community Hubs (Navigation)
- Frontend Layout & Dependencies
- Chat UI Components
- Go Rooms API Backend
- Chat List & Platform Tabs
- Graphify Skill Workflow
- Chat Screen UI Anatomy
- TypeScript Config
- Frontend Design System Rules
- Design Reference Logo
- Public Logo Asset
- Root Package Firebase
- Next.js Config
- Next Env Types
- PostCSS Config
- Backend Go Module

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `graphify Skill` - 16 edges
3. `Room` - 8 edges
4. `Helios / Kouventa Frontend Design System` - 8 edges
5. `WriteJSON()` - 7 edges
6. `Kouventa Chat Screen (Interactions > Chat)` - 7 edges
7. `RoomHandler` - 6 edges
8. `writeError()` - 6 edges
9. `react` - 6 edges
10. `graphify Usage Rules (CLAUDE.md)` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Post-Commit Auto-Rebuild Hook` --semantically_similar_to--> `Run graphify update after code changes`  [INFERRED] [semantically similar]
  .claude/skills/graphify/references/hooks.md → CLAUDE.md
- `Native CLAUDE.md Integration` --conceptually_related_to--> `graphify Usage Rules (CLAUDE.md)`  [INFERRED]
  .claude/skills/graphify/references/hooks.md → CLAUDE.md
- `graphify Usage Rules (CLAUDE.md)` --references--> `graphify explain`  [EXTRACTED]
  CLAUDE.md → .claude/skills/graphify/references/query.md
- `graphify Usage Rules (CLAUDE.md)` --references--> `graphify path`  [EXTRACTED]
  CLAUDE.md → .claude/skills/graphify/references/query.md
- `Run graphify update after code changes` --conceptually_related_to--> `--update Incremental Re-extraction`  [INFERRED]
  CLAUDE.md → .claude/skills/graphify/references/update.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **graphify Full Build Pipeline** — _claude_skills_graphify_skill_ast_extraction, _claude_skills_graphify_skill_semantic_extraction, _claude_skills_graphify_skill_build_cluster_analyze, _claude_skills_graphify_skill_health_check, _claude_skills_graphify_skill_community_labeling, _claude_skills_graphify_skill_manifest [EXTRACTED 1.00]
- **Graph Navigation Commands (query/path/explain)** — _claude_skills_graphify_references_query_query, _claude_skills_graphify_references_query_path, _claude_skills_graphify_references_query_explain [EXTRACTED 1.00]
- **Brand Green #0EC83A Usage Across UI** — _claude_rules_frontend_design_system_color_primary, _claude_rules_frontend_design_system_chat_bubbles, _claude_rules_frontend_design_system_status_badges, _claude_rules_frontend_design_system_components, _claude_rules_frontend_design_system_logo [EXTRACTED 1.00]
- **Three-pane chat console layout** — frontend_design_reference_screenshot_1_left_nav_sidebar, frontend_design_reference_screenshot_1_conversation_list, frontend_design_reference_screenshot_1_chat_canvas, frontend_design_reference_screenshot_1_top_header [EXTRACTED 1.00]
- **Conversation filtering (platform, account, status, search)** — frontend_design_reference_screenshot_1_platform_tabs, frontend_design_reference_screenshot_1_account_selector_dropdown, frontend_design_reference_screenshot_1_status_tabs, frontend_design_reference_screenshot_1_chat_search_input, frontend_design_reference_screenshot_1_conversation_list [INFERRED 0.85]
- **Messaging session expiry and agent takeover** — frontend_design_reference_screenshot_1_expired_badge, frontend_design_reference_screenshot_1_chat_header, frontend_design_reference_screenshot_1_take_over_button [INFERRED 0.75]
- **K mark composition: green bar + light-green chevron** — frontend_public_logo_kmark, frontend_public_logo_primary_green_bar, frontend_public_logo_light_green_chevron [EXTRACTED 1.00]

## Communities (15 total, 4 thin omitted)

### Community 0 - "Frontend Layout & Dependencies"
Cohesion: 0.05
Nodes (35): frontend_app_globals, metadata, roboto, dependencies, firebase, next, react, react-dom (+27 more)

### Community 1 - "Chat UI Components"
Cohesion: 0.08
Nodes (26): Avatar(), AvatarProps, sizes, ChatList(), ChatWindow(), MessageBubble(), ApiStatus, Header() (+18 more)

### Community 2 - "Go Rooms API Backend"
Cohesion: 0.09
Nodes (32): NewRoomHandler(), SLAExpired(), TestSLAExpired(), writeError(), WriteJSON(), main(), withCORS(), go_pkg_cloud_google_com_go_firestore (+24 more)

### Community 3 - "Chat List & Platform Tabs"
Cohesion: 0.10
Nodes (29): ChatListProps, ChatTile(), ChatTileProps, NewRoomForm(), PLATFORM_TABS, STATUS_TABS, LivechatIcon(), PlusIcon() (+21 more)

### Community 4 - "Graphify Skill Workflow"
Cohesion: 0.09
Nodes (33): /graphify Skill Trigger, /graphify add URL, --watch Auto-Rebuild, Extra Exports (Wiki, Neo4j, FalkorDB, SVG, GraphML, MCP), Token Reduction Benchmark, EXTRACTED/INFERRED/AMBIGUOUS Confidence Rubric, Node ID Format Rule, Extraction Subagent Prompt Spec (+25 more)

### Community 5 - "Chat Screen UI Anatomy"
Cohesion: 0.12
Nodes (23): Selected Accounts Dropdown, Active Tab Green Underline Pattern, Brand Green #0EC83A, Chat Message Canvas, Chat Header (avatar, name, expiry countdown), Search Closed Chats Input + Filter Button, Conversation List, Conversation List Item (+15 more)

### Community 6 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "Frontend Design System Rules"
Cohesion: 0.39
Nodes (9): Chat Bubbles & Conversation UI, --color-primary #0EC83A Brand Green, UI Components (Avatars, Tabs, Sidebar, Inputs, Cards), Dark Theme Tokens & Surface Layering, Helios / Kouventa Frontend Design System, Kouventa K Logo (logo.webp), Status Badges (Expired, Notification, Online), Tailwind + CSS Variable Tokens Implementation (+1 more)

### Community 8 - "Design Reference Logo"
Cohesion: 0.50
Nodes (5): Kouventa Logo (logo.webp), Brand Primary Green, Light Green Angled Chevron (~#83E399), Stylized Geometric K Mark, Solid Green Vertical Bar (#0EC83A)

### Community 9 - "Public Logo Asset"
Cohesion: 0.50
Nodes (5): Kouventa Logo (logo.webp), Stylized Geometric K Mark, Kouventa / Helios Brand Identity, Angled Chevron (light green tint ~#83E399), Solid Vertical Bar (#0EC83A brand green)

### Community 10 - "Root Package Firebase"
Cohesion: 0.50
Nodes (3): dependencies, firebase, firebase

## Knowledge Gaps
- **84 isolated node(s):** `mini-kouventa/backend`, `createRoomRequest`, `roboto`, `metadata`, `AvatarProps` (+79 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 114 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Chat UI Components` to `Frontend Layout & Dependencies`, `Chat List & Platform Tabs`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `next` connect `Frontend Layout & Dependencies` to `Chat UI Components`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `mini-kouventa/backend`, `createRoomRequest`, `roboto` to the rest of the system?**
  _84 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Layout & Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._
- **Should `Chat UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.08367071524966262 - nodes in this community are weakly interconnected._
- **Should `Go Rooms API Backend` be split into smaller, more focused modules?**
  _Cohesion score 0.08961593172119488 - nodes in this community are weakly interconnected._
- **Should `Chat List & Platform Tabs` be split into smaller, more focused modules?**
  _Cohesion score 0.1021021021021021 - nodes in this community are weakly interconnected._