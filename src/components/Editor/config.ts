import {
  PluginEntry,
  CardEntry,
  PluginOptions,
  NodeInterface,
  RangeInterface,
  EngineInterface,
} from "@/aomao/engine/src";
//引入插件 begin
import Redo from "@/aomao/plugins/redo/src";
import Undo from "@/aomao/plugins/undo/src";
import Bold from "@/aomao/plugins/bold/src";
import Code from "@/aomao/plugins/code/src";
import Backcolor from "@/aomao/plugins/backcolor/src";
import Fontcolor from "@/aomao/plugins/fontcolor/src";
import Fontsize from "@/aomao/plugins/fontsize/src";
import Italic from "@/aomao/plugins/italic/src";
import Underline from "@/aomao/plugins/underline/src";
import Hr, { HrComponent } from "@/aomao/plugins/hr/src";
import Tasklist, { CheckboxComponent } from "@/aomao/plugins/tasklist/src";
import Orderedlist from "@/aomao/plugins/orderedlist/src";
import Unorderedlist from "@/aomao/plugins/unorderedlist/src";
import Indent from "@/aomao/plugins/indent/src";
import Heading from "@/aomao/plugins/heading/src";
import Strikethrough from "@/aomao/plugins/strikethrough/src";
import Sub from "@/aomao/plugins/sub/src";
import Sup from "@/aomao/plugins/sup/src";
import Alignment from "@/aomao/plugins/alignment/src";
import Mark from "@/aomao/plugins/mark/src";
import Quote from "@/aomao/plugins/quote/src";
import PaintFormat from "@/aomao/plugins/paintformat/src";
import RemoveFormat from "@/aomao/plugins/removeformat/src";
import SelectAll from "@/aomao/plugins/selectall/src";
import Link from "@/aomao/plugins/link-vue/src";
import Codeblock, {
  CodeBlockComponent,
} from "@/aomao/plugins/codeblock-vue/src";
import Image, {
  ImageComponent,
  ImageUploader,
} from "@/aomao/plugins/image/src";
import Table, { TableComponent } from "@/aomao/plugins/table/src";
import File, { FileComponent, FileUploader } from "@/aomao/plugins/file/src";
import Video, {
  VideoComponent,
  VideoUploader,
} from "@/aomao/plugins/video/src";
import Math, { MathComponent } from "@/aomao/plugins/math/src";
import Fontfamily from "@/aomao/plugins/fontfamily/src";
import Status, { StatusComponent } from "@/aomao/plugins/status/src";
import LineHeight from "@/aomao/plugins/line-height/src";
import Mention, { MentionComponent } from "@/aomao/plugins/mention/src";
import MarkRange from "@/aomao/plugins/mark-range/src";
import Test, { TestComponent } from "@/plugins/test";
import {
  ToolbarPlugin,
  ToolbarComponent,
  fontFamilyDefaultData,
} from "@/aomao/toolbar-vue/src";

import { Empty } from "ant-design-vue";
import { createApp } from "vue";
import Loading from "./Loading.vue";
import MentionPopover from "./Mention.vue";

const DOMAIN = "https://editor.yanmao.cc/api";

export const plugins: Array<PluginEntry> = [
  Redo,
  Undo,
  Bold,
  Code,
  Backcolor,
  Fontcolor,
  Fontsize,
  Italic,
  Underline,
  Hr,
  Tasklist,
  Orderedlist,
  Unorderedlist,
  Indent,
  Heading,
  Strikethrough,
  Sub,
  Sup,
  Alignment,
  Mark,
  Quote,
  PaintFormat,
  RemoveFormat,
  SelectAll,
  Link,
  Codeblock,
  Image,
  ImageUploader,
  Table,
  File,
  FileUploader,
  Video,
  VideoUploader,
  Math,
  ToolbarPlugin,
  Fontfamily,
  Status,
  LineHeight,
  Mention,
  MarkRange,
  Test,
];

export const cards: Array<CardEntry> = [
  HrComponent,
  CheckboxComponent,
  CodeBlockComponent,
  ImageComponent,
  TableComponent,
  FileComponent,
  VideoComponent,
  MathComponent,
  ToolbarComponent,
  StatusComponent,
  MentionComponent,
  TestComponent,
];
let engine: EngineInterface | null = null;

export const onLoad = (e: EngineInterface) => {
  engine = e;
};
export const pluginConfig: { [key: string]: PluginOptions } = {
  [MarkRange.pluginName]: {
    //标记类型集合
    keys: ["mark"],
    //标记数据更新后触发
    onChange: (
      addIds: { [key: string]: Array<string> },
      removeIds: { [key: string]: Array<string> }
    ) => {
      // 新增的标记
      const commentAddIds = addIds["comment"] || [];
      // 删除的标记
      const commentRemoveIds = removeIds["comment"] || [];
    },
    //光标改变时触发
    onSelect: (
      range: RangeInterface,
      selectInfo?: { key: string; id: string }
    ) => {
      const { key, id } = selectInfo || {};
      // 移除预览标记
      engine?.command.executeMethod(
        "mark-range",
        "action",
        "comment",
        "revoke"
      );
      if (key === "mark" && id) {
        engine?.command.executeMethod(
          "mark-range",
          "action",
          key,
          "preview",
          id
        );
      }
    },
  },
  [Italic.pluginName]: {
    // 默认为 _ 下划线，这里修改为单个 * 号
    markdown: "*",
  },
  [Image.pluginName]: {
    onBeforeRender: (status: string, url: string) => {
      if (url.startsWith("data:image/")) return url;
      return url + `?token=12323`;
    },
  },
  [ImageUploader.pluginName]: {
    file: {
      action: `${DOMAIN}/upload/image`,
      headers: { Authorization: 213434 },
    },
    remote: {
      action: `${DOMAIN}/upload/image`,
    },
    isRemote: (src: string) => src.indexOf(DOMAIN) < 0,
  },
  [FileUploader.pluginName]: {
    action: `${DOMAIN}/upload/file`,
  },
  [VideoUploader.pluginName]: {
    action: `${DOMAIN}/upload/video`,
    limitSize: 1024 * 1024 * 50,
  },
  [Video.pluginName]: {
    onBeforeRender: (status: string, url: string) => {
      return url + `?token=12323`;
    },
  },
  [Math.pluginName]: {
    action: `https://g.yanmao.cc/latex`,
    parse: (res: any) => {
      if (res.success) return { result: true, data: res.svg };
      return { result: false };
    },
  },
  [Mention.pluginName]: {
    action: `${DOMAIN}/user/search`,
    onLoading: (root: NodeInterface) => {
      const vm = createApp(Loading);
      vm.mount(root.get<HTMLElement>()!);
    },
    onEmpty: (root: NodeInterface) => {
      const vm = createApp(Empty);
      vm.mount(root.get<HTMLElement>()!);
    },
    onClick: (
      root: NodeInterface,
      { key, name }: { key: string; name: string }
    ) => {
      console.log("mention click:", key, "-", name);
    },
    onMouseEnter: (
      layout: NodeInterface,
      { name }: { key: string; name: string }
    ) => {
      const vm = createApp(MentionPopover, {
        name,
      });
      vm.mount(layout.get<HTMLElement>()!);
    },
  },
  [Fontsize.pluginName]: {
    //配置粘贴后需要过滤的字体大小
    filter: (fontSize: string) => {
      return (
        [
          "12px",
          "13px",
          "14px",
          "15px",
          "16px",
          "19px",
          "22px",
          "24px",
          "29px",
          "32px",
          "40px",
          "48px",
        ].indexOf(fontSize) > -1
      );
    },
  },
  [Fontfamily.pluginName]: {
    //配置粘贴后需要过滤的字体
    filter: (fontfamily: string) => {
      const item = fontFamilyDefaultData.find((item) =>
        fontfamily
          .split(",")
          .some(
            (name) =>
              item.value
                .toLowerCase()
                .indexOf(name.replace(/"/, "").toLowerCase()) > -1
          )
      );
      return item ? item.value : false;
    },
  },
  [LineHeight.pluginName]: {
    //配置粘贴后需要过滤的行高
    filter: (lineHeight: string) => {
      if (lineHeight === "14px") return "1";
      if (lineHeight === "16px") return "1.15";
      if (lineHeight === "21px") return "1.5";
      if (lineHeight === "28px") return "2";
      if (lineHeight === "35px") return "2.5";
      if (lineHeight === "42px") return "3";
      // 不满足条件就移除掉
      return ["1", "1.15", "1.5", "2", "2.5", "3"].indexOf(lineHeight) > -1;
    },
  },
};
