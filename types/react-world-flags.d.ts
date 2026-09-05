declare module "react-world-flags" {
  import type { ComponentType, ImgHTMLAttributes, ReactNode } from "react";

  export interface FlagProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
    code: string;
    fallback?: ReactNode;
  }

  const Flag: ComponentType<FlagProps>;
  export default Flag;
}
