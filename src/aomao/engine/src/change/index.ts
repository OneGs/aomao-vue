// @ts-nocheck
import { NodeInterface } from "../types/node";
import {
  ChangeInterface,
  ChangeOptions,
  ChangeRangeInterface,
} from "../types/change";
import { EngineInterface } from "../types/engine";
import { RangeInterface, RangePath } from "../types/range";
import ChangeEvent from "./event";
import Parser from "../parser";
import { ANCHOR_SELECTOR, CURSOR_SELECTOR, FOCUS_SELECTOR } from "../constants";
import { combinText, convertMarkdown, createMarkdownIt } from "../utils";
import { CARD_CENTER_SELECTOR, TRIGGER_CARD_ID } from "../constants/card";
import { DATA_ID, EDITABLE_SELECTOR, UI_SELECTOR } from "../constants/root";
import { SelectionInterface } from "../types/selection";
import Selection from "../selection";
import { $ } from "../node";
import NativeEvent from "./native-event";
import ChangeRange from "./range";
import Range from "../range";

const FLUSHING: WeakMap<EngineInterface, boolean> = new WeakMap();
const SELECT_FLUSHING: WeakMap<EngineInterface, boolean> = new WeakMap();
class ChangeModel implements ChangeInterface {
  private engine: EngineInterface;
  private options: ChangeOptions;
  event: ChangeEvent;
  valueCached: string | null = null;
  onChange: (trigger: "remote" | "local" | "both") => void;
  onRealtimeChange: (trigger: "remote" | "local") => void;
  onSelect: (range?: RangeInterface) => void;
  onSelectStart: () => void;
  onSelectEnd: () => void;
  onSetValue: () => void;
  rangePathBeforeCommand?: { start: RangePath; end: RangePath };
  marks: Array<NodeInterface> = [];
  blocks: Array<NodeInterface> = [];
  inlines: Array<NodeInterface> = [];
  changeTrigger: Array<string> = [];
  range: ChangeRangeInterface;
  nativeEvent: NativeEvent;

  constructor(engine: EngineInterface, options: ChangeOptions = {}) {
    this.options = options;
    this.engine = engine;
    this.event = new ChangeEvent(engine, {});

    this.onChange = this.options.onChange || function () {};
    this.onRealtimeChange = this.options.onRealtimeChange || function () {};
    let prevRange: Record<string, Node | number> | null = null;
    this.onSelect = (range?: RangeInterface) => {
      const { mark, block, inline } = engine;
      range = range || this.range.get();
      this.marks = mark.findMarks(range);
      this.blocks = block.findBlocks(range);
      this.inlines = inline.findInlines(range);
      if (
        prevRange?.startContainer === range.startContainer &&
        prevRange?.startOffset === range.startOffset &&
        prevRange?.endContainer === range.endContainer &&
        prevRange?.endOffset === range.endOffset
      )
        return;
      prevRange = {
        startContainer: range.startContainer,
        startOffset: range.startOffset,
        endContainer: range.endContainer,
        endOffset: range.endOffset,
      };
      if (!SELECT_FLUSHING.get(this.engine)) {
        SELECT_FLUSHING.set(this.engine, true);
        Promise.resolve().then(() => {
          SELECT_FLUSHING.set(this.engine, false);
          if (this.options.onSelect) this.options.onSelect();
        });
      }
    };
    this.onSelectStart = () => {
      if (this.options.onSelectStart) this.options.onSelectStart();
    };
    this.onSelectEnd = () => {
      if (this.options.onSelectEnd) this.options.onSelectEnd();
    };
    this.onSetValue = this.options.onSetValue || function () {};
    this.range = new ChangeRange(engine, {
      onSelect: (range) => {
        this.onSelect(range);
      },
    });
    this.nativeEvent = new NativeEvent(engine);
  }

  init() {
    this.nativeEvent.init();
  }

  private _change() {
    if (!this.isComposing()) {
      this.engine.card.gc();
      const trigger =
        this.changeTrigger.length === 2
          ? "both"
          : this.changeTrigger[0] === "remote"
          ? "remote"
          : "local";
      this.onChange(trigger);
      this.changeTrigger = [];
    }
  }

  change(isRemote?: boolean, applyNodes?: Array<NodeInterface>) {
    const trigger = isRemote ? "remote" : "local";
    //??????????????????????????????onChange??????
    let editableElement: NodeInterface | undefined = undefined;
    if (isRemote) {
      applyNodes?.forEach((node) => {
        editableElement = node.closest(EDITABLE_SELECTOR);
        if (editableElement && editableElement.length > 0) {
          const card = this.engine.card.find(editableElement, true);
          if (card?.onChange) card?.onChange(trigger, editableElement);
        }
      });
    } else {
      const range = this.range.get();
      const { startNode } = range;
      //??????????????????????????????????????????????????????????????????????????????UI?????????????????? trigger-card-id ??????????????????card
      if (startNode.inEditor()) {
        editableElement = startNode.closest(EDITABLE_SELECTOR);
      } else {
        const uiElement = startNode.closest(UI_SELECTOR);
        const cardId = uiElement.attributes(TRIGGER_CARD_ID);
        if (cardId) {
          editableElement = this.engine.card
            .find(cardId)
            ?.root.closest(EDITABLE_SELECTOR);
        }
      }
      if (editableElement && editableElement.length > 0) {
        const card = this.engine.card.find(editableElement, true);
        if (card?.onChange) card?.onChange(trigger, editableElement);
      } else {
        applyNodes?.forEach((node) => {
          editableElement = node.closest(EDITABLE_SELECTOR);
          if (editableElement && editableElement.length > 0) {
            const card = this.engine.card.find(editableElement, true);
            if (card?.onChange) card?.onChange(trigger, editableElement);
          }
        });
      }
    }

    this.onRealtimeChange(trigger);
    if (this.changeTrigger.indexOf(trigger) < 0)
      this.changeTrigger.push(trigger);
    if (!FLUSHING.get(this.engine)) {
      FLUSHING.set(this.engine, true);
      Promise.resolve().then(() => {
        FLUSHING.set(this.engine, false);
        this._change();
      });
    }
  }

  isComposing() {
    return this.event.isComposing;
  }

  isSelecting() {
    return this.event.isSelecting;
  }

  initValue(
    range?: RangeInterface,
    apply = true,
    container = this.engine.container
  ) {
    const html = container.html();
    const defaultHtml = "<p><br /></p>";
    if (
      html === defaultHtml ||
      (container.get<Node>()?.childNodes.length || 0) > 0
    )
      return;
    const emptyHtml = html || defaultHtml;
    const node = $(emptyHtml);
    if (node.get<Node>()?.childNodes.length === 0) node.html("<br />");
    container.empty().append(node);
    const safeRange = range || this.range.get();

    if (!range && apply) {
      safeRange.select(node, true).collapse(false);
      this.apply(safeRange);
    }
  }

  setValue(
    value: string,
    onParse?: (node: NodeInterface) => void,
    callback?: (count: number) => void
  ) {
    const range = this.range.get();
    const { schema, conversion, container, history, mark, card } = this.engine;
    if (value === "") {
      this.engine.container.html(value);
      this.initValue(undefined, false);
      if (callback) callback(0);
    } else {
      const parser = new Parser(
        value,
        this.engine,
        (root) => {
          mark.removeEmptyMarks(root);
          root.allChildren("editable").forEach((child) => {
            if (onParse) {
              onParse(child);
            }
          });
        },
        false
      );
      container.html(parser.toValue(schema, conversion, false, true));
      card.render(undefined, (count) => {
        if (callback) callback(count);
      });
      const cursor = container.find(CURSOR_SELECTOR);
      const selection: SelectionInterface = new Selection(this.engine, range);

      if (cursor.length > 0) {
        selection.anchor = cursor;
        selection.focus = cursor;
      }

      const anchor = container.find(ANCHOR_SELECTOR);
      const focus = container.find(FOCUS_SELECTOR);

      if (anchor.length > 0 && focus.length > 0) {
        selection.anchor = anchor;
        selection.focus = focus;
      }

      if (selection.anchor && selection.focus) {
        selection.move();
        this.range.select(range);
        this.onSelect();
      }
      this.onSetValue();
      history.clear();
    }
    this.change();
  }

  setHtml(html: string, callback?: (count: number) => void) {
    const { card, container } = this.engine;
    this.nativeEvent.paste(
      html,
      undefined,
      callback,
      true,
      (
        fragment: DocumentFragment,
        _range?: RangeInterface,
        _rangeCallback?: (range: RangeInterface) => void,
        _followActiveMark?: boolean
      ) => {
        container.empty().append(fragment);
        card.render(undefined, (count) => {
          this.initValue(undefined, false);
          this.engine.trigger("paste:after");
          if (callback) callback(count);
        });
        this.change();
      },
      false
    );
  }

  setMarkdown(text: string, callback?: (count: number) => void) {
    const markdown = createMarkdownIt(this.engine, "zero");
    markdown.enable(["paragraph", "html_inline", "newline"]);
    //.disable(['strikethrough', 'emphasis', 'link', 'image', 'table', 'code', 'blockquote', 'hr', 'list', 'heading'])
    const tokens = markdown.parse(text, {});
    if (tokens.length === 0) return;
    let result = convertMarkdown(this.engine, markdown, tokens);
    if (!result) result = text;
    const { card, container } = this.engine;
    this.nativeEvent.paste(
      result,
      undefined,
      callback,
      true,
      (
        fragment: DocumentFragment,
        _range?: RangeInterface,
        _rangeCallback?: (range: RangeInterface) => void,
        _followActiveMark?: boolean
      ) => {
        container.empty().append(fragment);
        card.render(undefined, (count) => {
          this.initValue(undefined, false);
          this.engine.trigger("paste:after");
          if (callback) callback(count);
        });
        this.change();
      }
    );
  }

  getOriginValue(container: NodeInterface = this.engine.container) {
    const { schema, conversion } = this.engine;
    return new Parser(
      container.clone(true),
      this.engine,
      undefined,
      false
    ).toValue(schema, conversion);
  }

  getValue(
    options: {
      ignoreCursor?: boolean;
    } = {}
  ) {
    let value;
    if (options.ignoreCursor || this.isComposing()) {
      value = this.getOriginValue();
    } else {
      let range = this.range.get();
      let selection;
      if (!range.inCard()) {
        const path = range.toPath(true);
        if (!path) return this.getOriginValue();
        range = Range.fromPath(this.engine, path, true);
        selection = range.createSelection();
      }
      value = this.getOriginValue();
      selection?.move();
    }
    return value;
  }

  cacheRangeBeforeCommand() {
    this.rangePathBeforeCommand = this.range.get().toPath();
  }

  getRangePathBeforeCommand() {
    const rangePath = this.rangePathBeforeCommand;
    this.rangePathBeforeCommand = undefined;
    return rangePath;
  }

  isEmpty() {
    const { container, node, schema } = this.engine;
    const tags = schema.getAllowInTags();
    const children = container.children();
    return (
      children.length === 0 ||
      (children.length === 1 &&
        node.isEmpty(container) &&
        !container.allChildren().some((child) => tags.includes(child.name)))
    );
  }

  combinText() {
    combinText(this.engine.container);
  }

  /**
   * ????????????????????????dom???????????????
   * @param range ??????
   */
  apply(range?: RangeInterface) {
    this.combinText();
    const { inline, mark, nodeId } = this.engine;
    if (range) {
      const selection = range.createSelection("change-apply");
      inline
        .findInlines(range)
        .forEach((inlineNode) => inline.repairCursor(inlineNode));
      mark.findMarks(range).forEach((markNode) => mark.repairCursor(markNode));
      selection.move();
      range.shrinkToTextNode();
      this.range.select(range);
    }
    this.change();

    nodeId.generateAll(this.engine.container);
  }

  /**
   * ????????????
   * @param fragment ??????
   * @param range ??????????????????
   * @param callback ????????????????????????
   * @param followActiveMark ?????????????????????????????????????????????mark??????
   */
  insert(
    fragment: DocumentFragment,
    range?: RangeInterface,
    callback: (range: RangeInterface) => void = () => {},
    followActiveMark = true
  ) {
    const { block, list, schema, mark, inline } = this.engine;
    const nodeApi = this.engine.node;
    range = range || this.range.toTrusty();
    const firstBlock = block.closest(range.startNode);
    const lastBlock = block.closest(range.endNode);
    const onlyOne = lastBlock[0] === firstBlock[0];
    const isBlockLast = block.isLastOffset(range, "end");
    const mergeTags = schema.getCanMergeTags();
    const allowInTags = schema.getAllowInTags();
    const mergeNode = firstBlock.closest(mergeTags.join(","));
    const isCollapsed = range.collapsed;
    const childNodes = fragment.childNodes;
    const firstNode = $(fragment.firstChild || []);
    const unwrapToFirst = () => {
      const fragmentNode = $(fragment);
      const first = fragmentNode.first();
      //??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????
      const cloneRange = range!
        .cloneRange()
        .shrinkToElementNode()
        .shrinkToTextNode();
      const { startNode } = cloneRange;
      if (
        startNode.inEditor() &&
        first &&
        first.name === "p" &&
        !(first.length === 1 && first.first()?.name === "br")
      ) {
        // ????????????????????????????????????
        if (startNode.name === "p" && nodeApi.isEmptyWidthChild(startNode)) {
          const styles = first.css();
          startNode.css(styles);
        }
        nodeApi.unwrap(first);
      }
    };
    if (!isCollapsed) {
      this.delete(range, onlyOne || !isBlockLast, followActiveMark);
      if (nodeApi.isEmptyWidthChild(range.startNode))
        range.shrinkToElementNode().shrinkToTextNode();
      unwrapToFirst();
    } else {
      unwrapToFirst();
      if (range.startNode.isText()) {
        const inlineNode = inline.closest(range.startNode);
        const text = range.startNode.text();
        if (
          inlineNode.length === 0 &&
          !inlineNode.equal(range.startNode) &&
          /^\u200B/.test(text)
        )
          range.startNode.text(text.substr(1));
      }
    }
    let startRange: { node: NodeInterface; offset: number } | undefined =
      undefined;
    const apply = (range: RangeInterface) => {
      if (startRange && startRange.node[0].isConnected) {
        range
          .shrinkToElementNode()
          .setStart(startRange.node, startRange.offset);
        range.enlargeToElementNode();
      }
      block.merge(range);
      list.merge(undefined, range);
      mark.merge(range);
      inline.flat(range);
      if (callback) callback(range);
      this.apply(range);
    };
    if (
      nodeApi.isList(range.startNode) ||
      range.startNode.closest("li").length > 0
    ) {
      const children = range.startNode.children();
      startRange = {
        node: range.startNode,
        offset:
          children.length === 1 && children[0].nodeName === "BR"
            ? 0
            : range.startOffset,
      };
      list.insert(fragment, range);
      apply(range);
      return;
    }
    if (!firstNode[0]) {
      apply(range);
      return;
    }

    // ????????????????????????block?????????????????????????????????
    if (!nodeApi.isBlock(firstNode)) {
      range.shrinkToElementNode();
      if (childNodes.length > 0) {
        const children = range.startNode.children();
        startRange = {
          node: range.startNode,
          offset:
            children.length === 1 && children[0].nodeName === "BR"
              ? 0
              : range.startOffset,
        };
      }
      let nextNode = firstNode.next();
      let beforeNode = firstNode;
      const newRange = nodeApi.insert(firstNode, range);
      if (newRange) range = newRange;
      while (nextNode && !nodeApi.isBlock(nextNode)) {
        if (range.startContainer.nodeType === Node.TEXT_NODE)
          range.enlargeToElementNode().collapse(false);
        const newNext = nextNode.next();
        beforeNode.after(nextNode);
        beforeNode = nextNode;
        //nodeApi.insert(nextNode, range);
        nextNode = newNext;
      }
      if (beforeNode !== firstNode) {
        range.select(beforeNode, true).collapse(false);
      }
      if (childNodes.length === 0) {
        apply(range);
        return;
      }
    }
    const cloneRange = range
      .cloneRange()
      .enlargeToElementNode(true)
      .collapse(false);
    const startNode =
      cloneRange.startContainer.childNodes[
        range.startOffset === 0 ? 0 : range.startOffset - 1
      ];
    const endNode = cloneRange.startContainer.childNodes[range.startOffset];

    if (childNodes.length !== 0) {
      let lastNode = $(childNodes[childNodes.length - 1]);
      if ("br" === lastNode.name) {
        lastNode.remove();
        lastNode = $(childNodes[childNodes.length - 1]);
      }
      if (!startRange) {
        const children = range.startNode.children();
        startRange = {
          node: range.startNode,
          offset:
            children.length === 1 && children[0].nodeName === "BR"
              ? 0
              : range.startOffset,
        };
      }
      let node: NodeInterface | null = $(childNodes[0]);
      let prev: NodeInterface | null = null;
      const appendNodes = [];
      while (node && node.length > 0) {
        nodeApi.removeSide(node);
        const next: NodeInterface | null = node.next();
        if (!next) {
          lastNode = node;
        }

        if (prev) {
          prev.after(node);
        } else {
          if (nodeApi.isInline(range.startNode)) {
            range.setStartAfter(range.startNode);
            range.collapse(true);
          }
          nodeApi.insert(node, range, true);
          if (nodeApi.isInline(node)) {
            range.setEndAfter(node);
            range.collapse(false);
          }
        }
        if (node.get()?.isConnected) appendNodes.push(node);
        if (!nodeApi.isBlock(node) && !next?.isText()) {
          if (prev) {
            range.select(node, true).collapse(false);
          }
          prev = null;
        } else {
          prev = node;
        }
        if (!next && node.get()?.isConnected && !nodeApi.isInline(node)) {
          range.select(node, true).collapse(false);
        }
        // ??????????????????????????????????????????
        if (startRange && !startRange.node[0].isConnected) {
          const parent = node.parent();
          if (parent) {
            startRange = {
              node: parent,
              offset: node.index(),
            };
          }
        }
        node = next;
      }
      if (mergeNode[0]) {
        appendNodes.forEach((element) => {
          if (
            mergeTags.indexOf(element.name) < 0 &&
            element.closest(mergeNode.name).length === 0
          ) {
            nodeApi.wrap(element, nodeApi.clone(mergeNode, false, false));
          }
        });
      }
      //range.shrinkToElementNode().collapse(false);
      // const component = card.find(range.startNode);
      // if (component) component.focus(range, false);
    }
    const getFirstChild = (node: NodeInterface) => {
      let child = node.first();
      if (!child || !nodeApi.isBlock(child)) return node;
      while (allowInTags.indexOf(child ? child.name : "") > -1) {
        child = child!.first();
      }
      return child;
    };

    const getLastChild = (node: NodeInterface) => {
      let child = node.last();
      if (!child || !nodeApi.isBlock(child)) return node;
      while (allowInTags.indexOf(child ? child.name : "") > -1) {
        child = child!.last();
      }
      return child;
    };

    const isSameListChild = (
      _lastNode: NodeInterface,
      _firstNode: NodeInterface
    ) => {
      if (_lastNode.isCard() || firstNode.isCard()) return;
      const fParent = _firstNode.parent();
      const lParent = _lastNode.parent();
      const isSameParent =
        fParent &&
        !fParent.isEditable() &&
        lParent &&
        !lParent.isEditable() &&
        fParent.name === lParent.name;
      return (
        ("p" === _firstNode.name && isSameParent) ||
        (_lastNode.name === _firstNode.name &&
          isSameParent &&
          !(
            "li" === _lastNode.name &&
            !list.isSame(_lastNode.parent()!, _firstNode.parent()!)
          ))
      );
    };

    const removeEmptyNode = (node: NodeInterface) => {
      while (!node.isEditable()) {
        const parent = node.parent();
        node.remove();
        if (!parent || !nodeApi.isEmpty(parent)) break;
        node = parent;
      }
    };

    const clearList = (lastNode: NodeInterface, nextNode: NodeInterface) => {
      if (lastNode.name === nextNode.name && "p" === lastNode.name) {
        const attr = nextNode.attributes();
        if (attr[DATA_ID]) delete attr[DATA_ID];
        lastNode.attributes(attr);
      }
      if (
        nodeApi.isEmptyWidthChild(lastNode) &&
        !nodeApi.isEmptyWidthChild(nextNode)
      ) {
        lastNode.get<Element>()!.innerHTML = "";
      }
      if (nodeApi.isCustomize(lastNode) === nodeApi.isCustomize(nextNode))
        list.unwrapCustomize(nextNode);
    };
    if (startNode) {
      const _firstNode = getFirstChild($(startNode.nextSibling || []))!;
      const _lastNode = getLastChild($(startNode))!;
      if (
        _lastNode.name === "p" &&
        _firstNode.name !== _lastNode.name &&
        isSameListChild(_lastNode, _firstNode)
      ) {
        clearList(_lastNode, _firstNode);
        nodeApi.merge(_lastNode, _firstNode, false);
        removeEmptyNode(_firstNode);
      }
    }
    if (endNode) {
      const prevNode = getLastChild($(endNode.previousSibling || []));
      const nextNode = getFirstChild($(endNode))!;
      if (prevNode && isSameListChild(prevNode, nextNode)) {
        nodeApi.merge(prevNode, nextNode, false);
        removeEmptyNode(nextNode);
      }
    }
    apply(range);
  }

  paste(
    html: string,
    range?: RangeInterface,
    callback?: (count: number) => void
  ) {
    this.nativeEvent.paste(html, range, callback, true);
  }

  /**
   * ????????????
   * @param range ?????????????????????????????????
   * @param isDeepMerge ?????????????????????
   * @param followActiveMark ?????????????????????????????????????????????mark??????
   */
  delete(
    range?: RangeInterface,
    isDeepMerge?: boolean,
    followActiveMark = true
  ) {
    const safeRange = range || this.range.toTrusty();
    if (safeRange.collapsed) {
      if (this.isEmpty()) this.initValue(safeRange);
      if (!range) this.apply(safeRange);
      return;
    }
    const { mark, inline, card } = this.engine;
    const nodeApi = this.engine.node;
    const blockApi = this.engine.block;
    let cloneRange = safeRange.cloneRange();
    cloneRange.collapse(true);
    const activeMarks = followActiveMark ? mark.findMarks(cloneRange) : [];
    safeRange.enlargeToElementNode();
    // ????????????????????? Block
    let block = blockApi.closest(
      safeRange
        .cloneRange()
        .shrinkToElementNode()
        .shrinkToTextNode()
        .enlargeToElementNode().startNode
    );
    // ????????? block ??????????????????
    if (!block.inEditor() && !block.isRoot()) {
      if (this.isEmpty()) this.initValue(safeRange);
      if (!range) this.apply(safeRange);
      return;
    }
    // ?????????????????????????????????????????????????????????????????????????????????
    if (block.isRoot()) {
      let child = block.children().eq(safeRange.startOffset);
      while (child?.isCard()) {
        const isBreak =
          child.equal(safeRange.endNode) || child.contains(safeRange.endNode);
        const next = child.next() || undefined;
        const component = card.find(child);
        if (component) card.removeNode(component);
        else child.remove();
        if (isBreak) {
          child = undefined;
          break;
        }
        child = next;
      }
      if (!child) {
        if (this.isEmpty()) this.initValue(safeRange);
        if (!range) this.apply(safeRange);
        return;
      }
      block = child;
    }
    const { endNode, endOffset } = safeRange;
    const isMoreLine = !blockApi
      .closest(safeRange.startNode)
      .equal(blockApi.closest(endNode));
    // <a>aaa<cursor /></a> -> <a>aaa</a>cursor />
    const inlineNode = inline.closest(endNode);
    if (inlineNode.length > 0 && endNode.parent()?.equal(inlineNode)) {
      if (endNode.isText()) {
        const text = endNode.text();
        if (endOffset === text.length - 1) {
          safeRange.setEndAfter(inlineNode);
        }
      }
    }
    const endContentNode = safeRange
      .cloneRange()
      .shrinkToElementNode()
      .shrinkToTextNode()
      .getEndOffsetNode();
    // ?????????????????????????????????
    safeRange.extractContents();

    let { startNode } = safeRange;
    if (
      startNode.isEditable() &&
      startNode.get<Node>()?.childNodes.length === 0
    ) {
      startNode.html("<p><br /></p>");
      this.engine.nodeId.generate(startNode);
    }
    // ????????????????????????????????????????????????
    startNode = safeRange
      .shrinkToElementNode()
      .shrinkToTextNode()
      .enlargeToElementNode().startNode;
    if (startNode.isCard() && startNode.find(CARD_CENTER_SELECTOR).length === 0)
      card.remove(startNode);
    safeRange.collapse(true);
    // ????????????
    startNode = safeRange
      .shrinkToElementNode()
      .shrinkToTextNode()
      .enlargeToElementNode().startNode;
    // ????????????????????????????????????????????????????????????
    if (
      block.isElement() &&
      !block.equal(startNode) &&
      block.get<Element>()!.childNodes.length === 0
    ) {
      block.remove();
    }
    // ?????????????????????????????????
    if (startNode.isText() || !block.inEditor()) {
      if (this.isEmpty()) this.initValue(safeRange);
      if (!range) this.apply(safeRange);
      return;
    }
    let isRemoveStartNode = false;
    if (isMoreLine && startNode.get<Node>()?.childNodes.length === 0) {
      const selection = safeRange.createSelection();
      startNode.remove();
      if (
        selection.anchor?.get<Node>()?.isConnected &&
        selection.focus?.get<Node>()?.isConnected
      ) {
        selection.move();
      }
      isRemoveStartNode = true;
      startNode = safeRange.startNode;
    }

    const prevNode = block;
    const nextNode =
      endContentNode && endContentNode.isConnected ? startNode : null;
    let isEmptyNode = startNode.get<Node>()?.childNodes.length === 0;
    if (!isEmptyNode && startNode.length > 0 && startNode.inEditor()) {
      if (
        startNode[0].childNodes.length === 1 &&
        startNode[0].firstChild?.nodeType === Node.ELEMENT_NODE &&
        nodeApi.isCustomize(startNode) &&
        startNode.first()?.isCard()
      )
        isEmptyNode = true;
    }
    if (isEmptyNode && nodeApi.isBlock(startNode) && startNode.inEditor()) {
      if (nodeApi.isList(startNode)) {
        startNode.remove();
      } else {
        let html = nodeApi.getBatchAppendHTML(activeMarks, "<br />");
        if (startNode.isEditable()) {
          html = `<p>${html}</p>`;
        }
        startNode.append($(html));
        const br = startNode.find("br");
        const parent = br.parent();
        if (parent && nodeApi.isMark(parent)) {
          nodeApi.replace(br, $("\u200b", null));
        }
        safeRange.select(startNode, true);
      }
      safeRange.shrinkToElementNode().shrinkToTextNode();
      safeRange.collapse(false);
      if (this.isEmpty()) this.initValue(safeRange);
      if (!range) this.apply(safeRange);
      return;
    }
    //????????????
    const deepMergeNode = (
      range: RangeInterface,
      prevNode: NodeInterface,
      nextNode: NodeInterface,
      marks: Array<NodeInterface>,
      isDeepMerge = false
    ) => {
      if (
        nodeApi.isBlock(prevNode) &&
        !nodeApi.isVoid(prevNode) &&
        !prevNode.isCard()
      ) {
        range.select(prevNode, true);
        range.collapse(false);
        const selection = range
          .shrinkToElementNode()
          .shrinkToTextNode()
          .createSelection();
        let parent = nextNode.parent();
        nodeApi.merge(prevNode, nextNode);
        while (parent && nodeApi.isBlock(parent) && nodeApi.isEmpty(parent)) {
          parent.remove();
          parent = parent.parent();
        }
        selection.move();
        range.enlargeToElementNode(true);
        const prev = range.getPrevNode();
        const next = range.getNextNode();
        // ????????????????????? Block
        const { startNode } = range;
        if (!prev && !next && nodeApi.isBlock(startNode)) {
          startNode.append($(nodeApi.getBatchAppendHTML(marks, "<br />")));
          range.select(startNode.find("br"), true);
          range.collapse(false);
        }

        if (prev && next && !prev.isCard() && !next.isCard() && isDeepMerge) {
          deepMergeNode(range, prev, next, marks);
        }
      }
    };
    if (
      prevNode &&
      nextNode &&
      nextNode.length > 0 &&
      nodeApi.isBlock(prevNode) &&
      nodeApi.isBlock(nextNode) &&
      !prevNode.equal(nextNode) &&
      !prevNode.parent()?.equal(nextNode) &&
      nextNode.inEditor()
    ) {
      deepMergeNode(safeRange, prevNode, nextNode, activeMarks, isDeepMerge);
    }

    startNode.children().each((node) => {
      const domNode = $(node);
      if (
        !nodeApi.isVoid(domNode) &&
        domNode.isElement() &&
        "" === nodeApi.html(domNode)
      )
        domNode.remove();
      //???inline?????????????????????????????????????????????
      if (nodeApi.isInline(domNode)) {
        inline.repairCursor(domNode);
      }
    });
    //???????????????
    if (nodeApi.isList(startNode) && nodeApi.isEmpty(startNode)) {
      startNode.remove();
    }
    //??????inline????????????????????????????????????????????????????????????????????????inline????????????
    cloneRange = safeRange.cloneRange().shrinkToTextNode();
    if (
      cloneRange.startNode.isText() &&
      /^\u200B/g.test(cloneRange.startNode.text()) &&
      cloneRange.startOffset === 0
    ) {
      const prev = cloneRange.startNode.prev();
      if (prev && this.engine.node.isInline(prev)) {
        safeRange.select(prev, true);
        safeRange.collapse(false);
      }
    }
    if (
      nodeApi.isBlock(startNode) &&
      startNode.get<Node>()?.childNodes.length === 0
    ) {
      startNode.html("<br />");
    }

    if (isRemoveStartNode) {
      if (
        nodeApi.isBlock(prevNode) &&
        prevNode.get<Node>()?.childNodes.length === 0
      ) {
        prevNode.html("<br />");
      }
      if (prevNode.inEditor()) safeRange.select(prevNode, true).collapse(false);
    }
    if (this.isEmpty()) this.initValue(safeRange);
    if (!range) this.apply(safeRange);
  }

  /**
   * ??????????????????????????????block????????????????????????????????????
   * @param node ??????
   */
  unwrap(node?: NodeInterface) {
    const { block } = this.engine;
    const range = this.range.get();
    node = node || block.closest(range.startNode);
    if (!node.inEditor()) {
      return;
    }

    const selection = range.createSelection();
    this.engine.node.unwrap(node);
    selection.move();
    this.range.select(range);
  }

  /**
   * ??????????????????????????????block?????????????????????????????????????????????????????????
   * @param node ??????
   */
  mergeAfterDelete(node?: NodeInterface) {
    const { block, card, list, mark } = this.engine;
    const nodeApi = this.engine.node;
    const range = this.range.get();
    node = node || block.closest(range.startNode);
    const children = node.children();
    if (children.length === 0) {
      node.append($("<br />"));
      this.apply(range);
      return;
    }
    // <p><br />abc</p>???????????? br ??????
    const first = node.first();
    if (children.length > 1 && first?.name === "br") {
      first?.remove();
      return;
    }
    let prevBlock = node.prev();
    // ??????????????????
    if (!prevBlock) {
      const parent = node.parent();
      if (parent?.inEditor() && !parent?.isEditable()) {
        this.unwrap(node);
      }
      return;
    }
    // ?????????Card
    if (prevBlock.isCard()) {
      if (
        (children.length === 1 && first?.name === "br") ||
        nodeApi.isEmpty(node)
      ) {
        node.remove();
      }
      const component = card.find(prevBlock);
      if (component) {
        card.focus(component);
        return;
      }
    }
    // ????????? void ??????
    if (nodeApi.isVoid(prevBlock)) {
      prevBlock.remove();
      this.apply(range);
      return;
    }
    // ??????????????????
    if (nodeApi.isRootBlock(prevBlock) && nodeApi.isEmpty(prevBlock)) {
      prevBlock.remove();
      this.apply(range);
      return;
    }

    // ?????????????????????
    if (prevBlock.isText()) {
      const paragraph = $("<p />");
      prevBlock.before(paragraph);
      paragraph.append(prevBlock);
      prevBlock = paragraph;
    }
    if (nodeApi.isList(prevBlock)) {
      prevBlock = prevBlock.last();
    }
    // ???????????? <br /> ????????????
    if (children.length === 1 && first?.name === "br") {
      first?.remove();
    } else if (
      prevBlock &&
      prevBlock.get<Node>()?.childNodes.length === 1 &&
      prevBlock.first()?.name === "br"
    ) {
      prevBlock.first()?.remove();
    }

    if (!prevBlock || prevBlock.isText()) {
      this.unwrap(node);
    } else {
      const selection = range.createSelection();
      nodeApi.merge(prevBlock, node);
      selection.move();
      this.range.select(range);
      mark.merge();
      list.merge();
    }
  }

  destroy() {
    this.event.destroy();
  }
}

export default ChangeModel;
