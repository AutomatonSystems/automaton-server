// lemonjelly-jsx.d.ts
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any; // allow any HTML tag
  }
}