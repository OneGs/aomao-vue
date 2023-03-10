// @ts-nocheck
import debounce from "lodash/debounce";
import cloneDeep from "lodash/cloneDeep";
import { EventEmitter2 } from "eventemitter2";
import { Doc, Op } from "sharedb";
import { EngineInterface } from "../types/engine";
import { filterOperations, toJSON0 } from "./utils";
import {
  ConsumerInterface,
  Attribute,
  DocInterface,
  Member,
  MutationInterface,
  OTInterface,
  SelectionInterface,
} from "../types/ot";
import OTSelection from "./selection";
import OTDoc from "./doc";
import Consumer from "./consumer";
import Mutation from "./mutation";
import { random } from "../utils";
import { CARD_VALUE_KEY, READY_CARD_KEY } from "../constants";
import "./index.css";

const FLUSHING: WeakMap<EngineInterface, boolean> = new WeakMap();
class OTModel extends EventEmitter2 implements OTInterface {
  private engine: EngineInterface;
  private members: Array<Member>;
  private currentMember?: Member;
  private clientId: string;
  selection: SelectionInterface;
  consumer: ConsumerInterface;
  private mutation: MutationInterface | null;
  doc: DocInterface | Doc | null = null;
  isRemote = false;
  private debounceRefreshAttributes: (uids: string[]) => void;

  constructor(engine: EngineInterface) {
    super();
    this.engine = engine;
    this.members = [];
    this.selection = new OTSelection(engine);
    this.consumer = new Consumer(engine);
    this.mutation = new Mutation(engine.container, { engine });
    this.mutation.on("onChange", this.handleChange);
    this.clientId = random(8);
    this.debounceRefreshAttributes = debounce((uids: string[]) => {
      this.selection.refreshAttributes(
        ...this.members.filter((m) => uids.includes(m.uuid))
      );
    }, 200);
  }

  get isCache() {
    return this.mutation?.isCache ?? false;
  }

  colors = [
    "#597EF7",
    "#73D13D",
    "#FF4D4F",
    "#9254DE",
    "#36CFC9",
    "#FFA940",
    "#F759AB",
    "#40A9FF",
  ];

  initLocal() {
    if (this.doc) return;
    this.stopMutation();
    this.doc = new OTDoc(this.engine);
    this.mutation?.setDoc(this.doc);
    if (!this.engine.readonly) this.startMutation();
  }

  initRemote(
    doc: Doc,
    defaultValue?: string,
    onSelectionChange?: (path: Attribute) => void
  ) {
    // ?????????????????????????????????doc?????????????????????????????????
    const isDestroy = !this.doc || this.doc.type === null;
    this.stopMutation();
    if (!isDestroy) {
      this.doc!.destroy();
    }
    this.isRemote = true;
    // ??????????????????
    this.doc = doc;
    this.mutation?.setDoc(doc);
    // ????????????
    this.syncValue(defaultValue);
    // ????????????
    doc.on("op", (op, clientId) => {
      if (this.clientId !== clientId.toString()) {
        const ops = filterOperations(op);
        if (ops.length > 0) {
          this.apply(ops);
          this.engine.history.handleRemoteOps(ops);
        }
      }
    });
    this.selection.removeAllListeners();
    this.selection.on("change", (path) => {
      if (onSelectionChange) onSelectionChange(path);
    });
    if (!this.engine.readonly) this.startMutation();
    if (isDestroy) {
      this.emit("load");
    }
  }

  handleChange = (ops: Op[]) => {
    const newOps = this.engine.trigger("opsChange", ops);
    if (newOps) {
      ops = newOps;
    }
    this.submitOps(ops);
    const { history, change } = this.engine;
    history.handleSelfOps(
      ops.filter((op) => {
        if (op["nl"] === true && op.p[op.p.length - 1] === CARD_VALUE_KEY) {
          history.handleNLCardValue(op);
        }
        return !op["nl"] && !op.p.includes(READY_CARD_KEY);
      })
    );

    this.engine.trigger("ops", ops);
    if (
      ops.find(
        (op) => ("od" in op || "oi" in op) && op.p.includes(CARD_VALUE_KEY)
      )
    ) {
      change.change(false);
    }
  };

  submitOps(ops: Op[]) {
    if (!this.doc || ops.length === 0) return;
    ops.forEach((op) => {
      (op as any).uid = this.currentMember?.uuid;
    });
    // ??????????????????????????????????????????????????????
    const tempDoc = new OTDoc();
    const tempData = JSON.parse(JSON.stringify(this.doc.data));
    tempDoc.create(tempData);
    tempDoc.submitOp(ops, null, (err: any) => {
      tempDoc.destroy();
      if (!this.doc) return;
      // ??????????????????????????????????????????????????????data????????????????????????ops??????
      if (err) {
        this.engine.messageError(
          "ot",
          `If there is an error in the collaborative structure, the content of the server will be reset, and the current history will also be cleared.`,
          err,
          ops,
          tempData
        );
        this.engine.history.clear();
        // ????????????????????????????????????
        const delOps: any[] = [];
        const data = this.doc.data;
        for (let i = data.length - 1; i > 1; i--) {
          const item = data[i];
          delOps.push({
            bi: -1,
            id: "",
            ld: item,
            p: [i],
            nl: undefined,
          });
        }
        // ????????????????????????
        const addOps = [];
        const newData = toJSON0(this.engine.container) || [];
        for (let i = 2; i < newData.length; i++) {
          const item = newData[i];
          addOps.push({
            bi: -1,
            id: "",
            li: item,
            p: [i],
            nl: undefined,
          });
        }
        // ????????????????????????????????????
        this.doc.submitOp(delOps.concat(addOps), {
          source: this.clientId,
        });
        this.selection.emitSelectChange(true);
        return;
      }
      this.doc.submitOp(
        ops,
        {
          source: this.clientId,
        },
        (error) => {
          if (error) {
            this.engine.messageError(
              "ot",
              "SubmitOps Error:",
              error,
              "OPS:",
              ops,
              "DATA:",
              this.doc?.data
            );
            // ??????
            this.doc?.destroy();
          }
          this.selection.emitSelectChange(true);
        }
      );
    });
  }

  /**
   * ??????????????????????????????????????????
   * @param root
   */
  diff(root: Element = this.engine.container.get<Element>()!) {
    return this.mutation?.diff(root) || [];
  }

  apply(ops: Op[]) {
    this.stopMutation();
    this.consumer.handleRemoteOperations(ops);
    this.selection.emitSelectChange();
    const uids: string[] = [];
    ops.forEach((op) => {
      if ("uid" in op) {
        uids.push(op["uid"]);
      }
    });
    setTimeout(() => {
      this.debounceRefreshAttributes(uids);
    }, 0);
    this.startMutation();
  }

  syncValue(defaultValue?: string) {
    const { doc, engine } = this;
    if (!doc) return;
    // ??????div ??? selection-data ??? ????????????????????????
    if (doc.type && Array.isArray(doc.data) && doc.data.length > 2) {
      // ????????????????????????????????????????????????
      this.engine.setJsonValue(doc.data);
      return;
    }
    // ???????????????????????????????????????????????????
    if (defaultValue) engine.setValue(defaultValue);
    // ?????????????????????????????????????????????
    doc.on("create", () => {
      const data = toJSON0(engine.container);
      (doc as Doc).submitOp(
        [
          {
            p: [],
            oi: data,
          },
        ],
        {
          source: this.clientId,
        }
      );
    });
  }

  startMutation() {
    if (this.mutation) this.mutation.start();
  }

  stopMutation() {
    if (this.mutation) this.mutation.stop();
  }

  isStopped() {
    return this.mutation?.isStopped ?? false;
  }

  startMutationCache() {
    if (this.mutation) this.mutation.startCache();
  }

  submitMutationCache() {
    if (this.mutation) this.mutation.submitCache();
  }

  destroyMutationCache() {
    if (this.mutation) this.mutation.destroyCache();
  }

  /**
   * ?????????????????????
   * @returns
   */
  getCaches(): MutationRecord[] {
    return this.mutation?.getCaches() || [];
  }

  getColors() {
    return this.colors;
  }

  setColors(colors: string[]) {
    this.colors = colors;
  }

  setMemberColor(member: Member) {
    let index = member.index || this.members.length + 1;
    index = (index - 1) % this.colors.length;
    member.color = this.colors[index];
  }

  getMembers() {
    return cloneDeep(this.members);
  }

  setMembers(members: Array<Member>) {
    members = cloneDeep(members);
    members.forEach((member) => {
      this.setMemberColor(member);
    });
    this.members = members;
  }

  addMember(member: Member) {
    member = cloneDeep(member);
    this.setMemberColor(member);
    if (!this.members.find((m) => m.uuid === member.uuid)) {
      this.members.push(member);
    }
  }

  removeMember(member: Member) {
    member = cloneDeep(member);
    if (!member.uuid) return;
    this.members = this.members.filter((m) => {
      return m.uuid !== member.uuid;
    });
    this.selection.removeAttirbute(member.uuid);
  }

  setCurrentMember(member: Member) {
    member = cloneDeep(member);
    this.setMemberColor(member);
    const findMember = this.members.find((m) => m.uuid === member.uuid);
    if (!findMember) return;
    this.currentMember = findMember;
    this.selection.setCurrent(findMember);
  }

  getCurrentMember() {
    return this.currentMember;
  }

  renderSelection(attributes: Attribute[] | Attribute) {
    if (!FLUSHING.get(this.engine)) {
      FLUSHING.set(this.engine, true);
      Promise.resolve().then(() => {
        FLUSHING.set(this.engine, false);
        if (!Array.isArray(attributes)) attributes = [attributes];
        attributes.forEach((attribute) => {
          if (this.currentMember && attribute.uuid === this.currentMember.uuid)
            return;
          const member = this.members.find((m) => m.uuid === attribute.uuid);
          if ("remove" in attribute || !member)
            this.selection.removeAttirbute(attribute.uuid);
          else {
            this.selection.setAttribute(attribute, member);
          }
        });
      });
    }
  }

  destroy() {
    if (this.doc) this.doc.destroy();
    this.selection.destory();
    this.mutation?.off("onChange", this.handleChange);
    this.mutation?.destroyCache();
    this.stopMutation();
    this.mutation = null;
  }
}

export default OTModel;
