declare module "webpack-unpack" {
  export default function unpack(data: string): {
    id: number | string;
    source: string;
  }[];
}
