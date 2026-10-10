const OWNER = "kr1-tech";
const REPO = "Rawdump.github.io";
const BRANCH = "main";
const SITE_ORIGIN = "https://kr1-tech.github.io";
const SITE_URL = "https://kr1-tech.github.io/Rawdump.github.io";
const MAX_SIZE = 20 * 1024 * 1024;

const encoder = new TextEncoder();
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomId(length = 15) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function base64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": SITE_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function saveToGitHub(token, path, bytes, id) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodedPath}`,
    {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Add Rawdump upload ${id}`,
        branch: BRANCH,
        content: base64(bytes)
      })
    }
  );

  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`GitHub API returned ${response.status}: ${details}`);
  }
}

function page(title, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Rawdump</title>
<style>
body{margin:0;padding:24px;background:#111318;color:#f1f3f8;font:16px/1.6 system-ui,sans-serif}
main{max-width:900px;margin:5vh auto}
h2{font-size:22px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#191c23;border:1px solid #303440;border-radius:12px;padding:18px;overflow:auto}
a{color:#a5b4fc;overflow-wrap:anywhere}
small{color:#9ca3b4}
</style>
</head>
<body><main>
<h2>${escapeHtml(title)}</h2>
${content}
<p><small>Hosted with Rawdump</small></p>
</main></body></html>`;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (origin && origin !== SITE_ORIGIN) {
      return new Response("Origin not allowed", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname !== "/upload") {
      return new Response("Rawdump Worker is online.", {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Use POST to upload." }, 405);
    }

    if (!env.GITHUB_TOKEN) {
      return json({ error: "Server is missing its GITHUB_TOKEN secret." }, 500);
    }

    try {
      const form = await request.formData();
      const text = form.get("text");
      const file = form.get("file");
      const hasFile = file instanceof File && file.name !== "";

      if (hasFile && typeof text === "string" && text.length > 0) {
        return json({ error: "Upload either text or a file, not both." }, 400);
      }

      if (!hasFile && (typeof text !== "string" || text.length === 0)) {
        return json({ error: "Enter some text or choose a file." }, 400);
      }

      let id;
      let contentPage;

      if (hasFile) {
        if (file.size > MAX_SIZE) {
          return json({ error: "Files must be 20 MB or smaller." }, 413);
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const filename = (file.name || "download.bin")
          .replace(/[^A-Za-z0-9._-]/g, "_")
          .slice(0, 100) || "download.bin";

        id = randomId();

        await saveToGitHub(
          env.GITHUB_TOKEN,
          `${id}/${filename}`,
          bytes,
          id
        );

        const downloadUrl = `./${encodeURIComponent(filename)}`;
        contentPage = page(
          filename,
          `<p>Your file is ready.</p>
           <p><a href="${downloadUrl}" download="${escapeHtml(filename)}">Download ${escapeHtml(filename)}</a></p>`
        );
      } else {
        const bytes = encoder.encode(text);

        if (bytes.length > MAX_SIZE) {
          return json({ error: "Text must be 20 MB or smaller." }, 413);
        }

        id = randomId();
        contentPage = page("Rawdump " + id, `<pre>${escapeHtml(text)}</pre>`);
      }

      await saveToGitHub(
        env.GITHUB_TOKEN,
        `${id}/index.html`,
        encoder.encode(contentPage),
        id
      );

      return json({
        id,
        url: `${SITE_URL}/${id}/`
      });
    } catch (error) {
      return json({
        error: error instanceof Error
          ? error.message
          : "An unexpected upload error occurred."
      }, 500);
    }
  }
};
