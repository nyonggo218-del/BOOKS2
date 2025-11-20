// Hardcode: /functions/[[path]]/rss.xml.js

const BLOG_TITLE = "RSS FEEDS";
const BLOG_DESCRIPTION = "ALL RSSS FEEDS";

function escapeXML(str) {
  if (!str) return "";
  return str.replace(/[<>&"']/g, function (match) {
    switch (match) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return match;
    }
  });
}

export async function onRequestGet(context) {
  const { env, request, params } = context;
  const db = env.DB; // Pastikan Binding D1 di Dashboard bernama "DB"

  try {
    const url = new URL(request.url);

    // ============================================================
    // 🔴 PERBAIKAN UTAMA: DETEKSI SUBDOMAIN ROUTER
    // ============================================================
    // Kita cek apakah ada header 'X-Forwarded-Host' dari Router?
    const forwardedHost = request.headers.get("X-Forwarded-Host");
    
    // Jika ada (akses dari subdomain), pakai itu. Jika tidak, pakai origin asli.
    const SITE_URL = forwardedHost 
      ? `${url.protocol}//${forwardedHost}` 
      : url.origin;
    // ============================================================

    // [MODIFIED] Parsing Path Array
    const pathSegments = params.path || [];

    // Assign segments:
    const kategori = pathSegments[0] || null; 
    const judulAwal = pathSegments[1] || ""; 
    const judulAkhir = pathSegments[2] || ""; 

    // 2. Siapin query SQL (LOGIKA ASLI TETAP DIPERTAHANKAN)
    const queryParams = [];
    let query =
      "SELECT Judul, Deskripsi, Image, KodeUnik, tangal FROM Buku WHERE tangal IS NOT NULL AND tangal <= DATE('now')";

    if (kategori) {
      query += " AND UPPER(Kategori) = UPPER(?)";
      queryParams.push(kategori);
    }
    query += " ORDER BY tangal DESC LIMIT 500";
    
    const stmt = db.prepare(query).bind(...queryParams);
    const { results } = await stmt.all();

    // 3. Bikin judul & link dinamis
    const feedTitle = kategori
      ? `${escapeXML(BLOG_TITLE)} - Kategori: ${escapeXML(kategori)}`
      : escapeXML(BLOG_TITLE);
    
    // Link diri sendiri (Self Link) juga harus pakai SITE_URL yang benar
    // Kita rakit ulang URL path-nya
    const selfPath = url.pathname; 
    const selfLink = `${SITE_URL}${selfPath}`;

    // 4. Mulai bikin string XML
    let xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeXML(judulAwal)} ${feedTitle} ${escapeXML(judulAkhir)}</title>
  <link>${SITE_URL}</link>
  <description>${escapeXML(BLOG_DESCRIPTION)}</description>
  <language>en-us</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  <atom:link href="${selfLink}" rel="self" type="application/rss+xml" />
`;

    // 5. Looping setiap postingan
    for (const post of results) {
      const postUrl = `${SITE_URL}/post/${post.KodeUnik}`;

      const judulAsli = escapeXML(post.Judul);
      const judulBaru = `${judulAwal ? escapeXML(judulAwal) + ' ' : ''}${judulAsli}${judulAkhir ? ' ' + escapeXML(judulAkhir) : ''}`;

      let proxiedImageUrl = "";
      if (post.Image) {
        const encodedImageUrl = encodeURIComponent(post.Image);
        proxiedImageUrl = `${SITE_URL}/image-proxy?url=${encodedImageUrl}`;
      }

      xml += `
  <item>
    <title>${judulBaru}</title> <link>${postUrl}</link>
    <guid isPermaLink="true">${postUrl}</guid>
    <g:id>${escapeXML(post.KodeUnik)}</g:id>
    <description><![CDATA[${post.Deskripsi || "No description."}<br/><br/> Artikel tentang ${feedTitle} ditulis OLEH <a href="https://flowork.cloud">Flowork</a>]]></description>
    ${
      proxiedImageUrl
        ? `<g:image_link>${escapeXML(proxiedImageUrl)}</g:image_link>`
        : ""
    }
    <g:availability>in stock</g:availability>
    ${
      post.tangal
        ? `<pubDate>${new Date(post.tangal).toUTCString()}</pubDate>`
        : ""
    }
    </item>
`;
    }
    xml += `
</channel>
</rss>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "s-maxage=3600",
      },
    });
  } catch (e) {
    return new Response(`Server error: ${e.message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
