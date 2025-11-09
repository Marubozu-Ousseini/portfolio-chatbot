# Portfolio Chatbot – Diagrams

This folder contains Mermaid and PlantUML sources for the system architecture and sequence flow.

Mermaid files:
- `architecture.mmd` – High-level AWS architecture
- `sequence.mmd` – Request flow from widget to Lambda
- `combined.mmd` – Concatenated reference (Mermaid CLI renders only first diagram; use individual files for export)

PlantUML files:
- `architecture.puml` – Component / deployment view
- `sequence.puml` – Sequence of a chat request
- `combined.puml` – Two-page (newpage) file with both views

## Export to PDF

### Option A (Mermaid CLI via Node)
1. Install mermaid CLI once:
   
   ```bash
   npm install -g @mermaid-js/mermaid-cli
   ```
2. Render to PNG or PDF:
   
   ```bash
   mmdc -i docs/architecture.mmd -o docs/architecture.pdf
   mmdc -i docs/sequence.mmd -o docs/sequence.pdf
   ```

### Option B (VS Code Mermaid)
- Install a Mermaid preview extension.
- Open the `.mmd` file, use the preview, then export/print to PDF.

### Option C (Web Mermaid)
### Option D (PlantUML CLI)
1. Install prerequisites (Graphviz + PlantUML). On macOS with Homebrew:
   ```bash
   brew install graphviz
   ```
   Download plantuml.jar (https://plantuml.com/download) or `brew install plantuml`.
2. Render diagrams:
   ```bash
   plantuml docs/architecture.puml
   plantuml docs/sequence.puml
   plantuml docs/combined.puml
   ```
   Outputs: `architecture.png`, `sequence.png`, `combined.png` (and optionally `.svg` or `.pdf` with extra flags).
3. PDF export (one approach):
   ```bash
   plantuml -tpdf docs/architecture.puml
   plantuml -tpdf docs/sequence.puml
   plantuml -tpdf docs/combined.puml
   ```

### Option E (VS Code PlantUML)
- Install a PlantUML extension + ensure Graphviz is installed.
- Open `.puml` files, preview, then export.

### Option F (PlantUML Server / Web)
- Paste `.puml` content into an online PlantUML server or editor and export.
- Paste the contents into https://mermaid.live
- Export as PNG/PDF from the site.

## Notes
- Diagrams reflect current repo structure: Lambda (Node.js 20.x), API Gateway, S3 bucket `portfolio-chatbot-data-prod` (prefix `rag-data/`), Terraform-managed infra, and static widget clients.
- API responses now only return a `message` field (no `sources`).
- Choose Mermaid for quick iteration; PlantUML for multi-page combined exports.
