"""Bundle RatGPT as one HTML file using Python's standard library only."""

from pathlib import Path


def build() -> None:
    root = Path(__file__).resolve().parent.parent
    source = root / "source"
    html = (source / "index.html").read_text(encoding="utf-8")
    # Only the module-based source page needs a local-file redirect.
    redirect_start = html.index('  <!-- source-file-redirect:start -->')
    redirect_end = html.index('  <!-- source-file-redirect:end -->') + len('  <!-- source-file-redirect:end -->\n')
    html = html[:redirect_start] + html[redirect_end:]
    generator = (source / "rat.js").read_text(encoding="utf-8")
    app = (source / "app.js").read_text(encoding="utf-8")

    module_tag = '<script type="module" src="./app.js"></script>'
    export_statement = "export function generateRatReply()"
    import_statement = "import { generateRatReply } from './rat.js';"
    if html.count(module_tag) != 1:
        raise ValueError("Expected exactly one app.js module script in source/index.html")
    if generator.count(export_statement) != 1 or app.count(import_statement) != 1:
        raise ValueError("Unexpected module structure; update the bundler for the changed imports")

    generator = generator.replace(export_statement, "function generateRatReply()", 1)
    app = app.replace(import_statement, "", 1)
    javascript = "(() => {\n'use strict';\n" + generator + "\n" + app + "\n})();"
    if "</script" in javascript.lower():
        raise ValueError("Inline script contains an HTML closing tag; escape it before bundling")

    output = html.replace(module_tag, "<script>\n" + javascript + "\n</script>")
    destination = root / "index.html"
    destination.write_text(output, encoding="utf-8")
    print("Built index.html. Open this file directly in your browser.")


if __name__ == "__main__":
    build()
