/**
 * Injectable ports — the narrow interfaces through which the library reaches
 * host-provided backend capabilities (storage, persistence, …). The library
 * declares them; the host app implements them. See docs/LIBRARY_CONTRACT.md.
 */

export interface ImageUploadResult {
  /** Resolved URL/href the host stored the file at. */
  src: string
  alt?: string
  title?: string
}

/**
 * Host-supplied image upload handler. Called with the file picked by the user;
 * resolves to the stored location to insert into the document. Reject to abort
 * the insert (the failure is logged, nothing is inserted).
 */
export type ImageUploadHandler = (file: File) => Promise<ImageUploadResult>
