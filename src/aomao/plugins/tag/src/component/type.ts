import { CardValue } from "@/aomao/engine/src";

export type IType = "abandon" | "must" | "add" | "delete" | "";
export interface TagValue extends CardValue {
  tagType: IType;
  tagValue: string;
  isCustom?: boolean;
}
