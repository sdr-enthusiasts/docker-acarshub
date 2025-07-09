export class ACARSHubPage {
  #document_path: string = "";
  #document_url: string = "";

  // Private properties
  page_html: string = "";
  page_active: boolean = false;

  // Public methods
  constructor() {
    // Initialize the page
  }

  get_this() {
    return this;
  }

  set_html(): void {}

  set_page_urls(documentPath: string, documentUrl: string): void {
    this.#document_path = documentPath;
    this.#document_url = documentUrl;
  }
}
