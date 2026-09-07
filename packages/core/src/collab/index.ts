/**
 * Opt-in collaboration subpath entry (issue fe-aktifai#230).
 *
 * The main barrel (`@…/docflow-core`) must never statically pull the network
 * sync providers (y-webrtc / y-websocket). `createCollaboration` is already
 * lazy-safe (dynamic imports per provider kind), but `SubdocumentProvider`
 * cannot be made lazy — it is a synchronous class whose constructor starts a
 * WebSocket sync immediately. Importing it from the barrel would ship
 * y-websocket in every editor bundle.
 *
 * Import from `@…/docflow-core/collab` ONLY when you actually use
 * subdocument sync (or want every collaboration helper in one place). Doing
 * so loads y-websocket into your bundle.
 */
export {
  SubdocumentProvider,
  type SubdocState,
  type SubdocumentProviderOptions,
} from '../SubdocumentProvider.js'
export {
  createCollaboration,
  collaborationExtensions,
  type CollaborationOptions,
  type CollaborationSetup,
  type AwarenessState,
} from '../Collaboration.js'
