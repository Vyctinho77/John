declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string
        allowpopups?: string
        disablewebsecurity?: string
        partition?: string
        useragent?: string
        nodeintegration?: string
        webpreferences?: string
      },
      HTMLElement
    >
  }
}
