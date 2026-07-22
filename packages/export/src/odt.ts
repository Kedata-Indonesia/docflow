import JSZip from 'jszip'
import { plainTextFromHtml, escapeHtml } from './utils.js'

export async function generateOdt(title: string, html: string): Promise<Blob> {
  const text = plainTextFromHtml(html)
  const zip = new JSZip()

  const escapedText = text
    .split(/\r?\n/)
    .map((line) => `<text:p>${escapeHtml(line) || ' '}</text:p>`)
    .join('')

  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
  <office:body>
    <office:text>
      <text:p text:style-name="Title">${escapeHtml(title)}</text:p>
      ${escapedText}
    </office:text>
  </office:body>
</office:document-content>`

  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
  <style:styles>
    <style:style style:name="Title" style:family="paragraph">
      <style:text-properties fo:font-size="18pt" fo:font-weight="bold"/>
    </style:style>
  </style:styles>
</office:document-styles>`

  const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <office:meta><dc:title>${escapeHtml(title)}</dc:title></office:meta>
</office:document-meta>`

  const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`

  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.file('content.xml', contentXml)
  zip.file('styles.xml', stylesXml)
  zip.file('meta.xml', metaXml)
  zip.file('META-INF/manifest.xml', manifestXml)

  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text' })
}

export async function exportHtmlZip(title: string, html: string): Promise<Blob> {
  const zip = new JSZip()
  zip.file(`${title}.html`, html)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}
