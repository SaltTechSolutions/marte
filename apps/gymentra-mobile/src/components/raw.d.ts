/** Vite'ın `?raw` yükleyicisi: dosyayı metin olarak içe aktarır. */
declare module '*?raw' {
  const content: string;
  export default content;
}
