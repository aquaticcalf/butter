import { BaseFormatConverter, type FormatConverter } from "chat"
import {
  type Root,
  type Content,
  type Text,
  type Paragraph,
  type Strong,
  type Emphasis,
  type Delete,
  type InlineCode,
  type Code,
  type Link,
} from "mdast"

export interface TelegramEntity {
  type: string
  offset: number
  length: number
  url?: string
  language?: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function textNode(value: string): Text {
  return { type: "text", value }
}

function parseEntitiesToAst(text: string, entities?: TelegramEntity[]): Content[] {
  if (!entities || entities.length === 0) {
    return [textNode(text)]
  }

  const sorted = [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length)

  const result: Content[] = []
  let pos = 0
  const stack: { entity: TelegramEntity; children: Content[] }[] = []

  for (const entity of sorted) {
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!
      const topEnd = top.entity.offset + top.entity.length
      if (entity.offset >= topEnd) {
        const top2 = stack.pop()!
        const node = buildEntityNode(top2.entity, top2.children)
        if (stack.length > 0) {
          stack[stack.length - 1]!.children.push(node)
        } else {
          result.push(node)
        }
      } else {
        break
      }
    }

    if (entity.offset > pos) {
      const raw = textNode(text.slice(pos, entity.offset))
      if (stack.length > 0) {
        stack[stack.length - 1]!.children.push(raw)
      } else {
        result.push(raw)
      }
    }

    stack.push({ entity, children: [] })
    pos = entity.offset
  }

  while (stack.length > 0) {
    const top = stack.pop()!
    const topEnd = top.entity.offset + top.entity.length
    if (topEnd > pos) {
      top.children.push(textNode(text.slice(pos, topEnd)))
      pos = topEnd
    }
    const node = buildEntityNode(top.entity, top.children)
    if (stack.length > 0) {
      stack[stack.length - 1]!.children.push(node)
    } else {
      result.push(node)
    }
  }

  if (pos < text.length) {
    result.push(textNode(text.slice(pos)))
  }

  return mergeAdjacentText(result)
}

function mergeAdjacentText(children: Content[]): Content[] {
  const result: Content[] = []
  for (const child of children) {
    if (child.type === "text" && result.length > 0 && result[result.length - 1]!.type === "text") {
      const prev = result[result.length - 1] as Text
      prev.value += (child as Text).value
    } else {
      result.push(child)
    }
  }
  return result
}

function buildEntityNode(entity: TelegramEntity, children: Content[]): Content {
  switch (entity.type) {
    case "bold":
      return { type: "strong", children } as Strong
    case "italic":
      return { type: "emphasis", children } as Emphasis
    case "underline":
      return {
        type: "text",
        value: children.map((c) => ("value" in c ? c.value : "")).join(""),
      } as Text
    case "strikethrough":
      return { type: "delete", children } as Delete
    case "spoiler":
      return {
        type: "text",
        value: children.map((c) => ("value" in c ? c.value : "")).join(""),
      } as Text
    case "code":
      return {
        type: "inlineCode",
        value: children.map((c) => ("value" in c ? c.value : "")).join(""),
      } as InlineCode
    case "pre":
      return {
        type: "code",
        lang: entity.language || undefined,
        value: children.map((c) => ("value" in c ? c.value : "")).join(""),
      } as Code
    case "text_link":
      return {
        type: "link",
        url: entity.url || "",
        children,
      } as Link
    case "text_mention":
      return {
        type: "link",
        url: `tg://user?id=${children.map((c) => ("value" in c ? c.value : "")).join("")}`,
        children,
      } as Link
    default:
      return children.length > 0 ? children[0]! : textNode("")
  }
}

export class TelegramConverter extends BaseFormatConverter implements FormatConverter {
  fromAst(ast: Root): string {
    return ast.children.map((child: Content) => this.nodeToHtml(child)).join("\n\n")
  }

  private nodeToHtml(node: Content): string {
    const n = node as unknown as { type: string; children?: Content[]; value?: string; lang?: string; url?: string; ordered?: boolean }
    switch (n.type) {
      case "paragraph":
        return n.children!.map((c: Content) => this.nodeToHtml(c)).join("")

      case "text":
        return escapeHtml(n.value!)

      case "strong":
        return `<b>${n.children!.map((c: Content) => this.nodeToHtml(c)).join("")}</b>`

      case "emphasis":
        return `<i>${n.children!.map((c: Content) => this.nodeToHtml(c)).join("")}</i>`

      case "underline":
        return `<u>${n.children!.map((c: Content) => this.nodeToHtml(c)).join("")}</u>`

      case "delete":
        return `<s>${n.children!.map((c: Content) => this.nodeToHtml(c)).join("")}</s>`

      case "inlineCode":
        return `<code>${escapeHtml(n.value!)}</code>`

      case "code":
        if (n.lang) {
          return `<pre><code class="language-${escapeHtml(n.lang)}">${escapeHtml(n.value!)}</code></pre>`
        }
        return `<pre>${escapeHtml(n.value!)}</pre>`

      case "link":
        return `<a href="${escapeHtml(n.url!)}">${n.children!.map((c: Content) => this.nodeToHtml(c)).join("")}</a>`

      case "blockquote":
        return `<blockquote>${n.children!.map((c: Content) => this.nodeToHtml(c)).join("")}</blockquote>`

      case "list":
        return n.children!
          .map((item: Content, i: number) => {
            if (item.type !== "listItem") return ""
            const prefix = n.ordered ? `${i + 1}. ` : "• "
            return item.children!.map((c: Content) => `${prefix}${this.nodeToHtml(c)}`).join("\n")
          })
          .join("\n")

      case "listItem":
        return n.children!.map((c: Content) => this.nodeToHtml(c)).join("")

      default:
        if ("children" in node) {
          return (node as unknown as { children: Content[] }).children
            .map((c: Content) => this.nodeToHtml(c))
            .join("")
        }
        if ("value" in node) {
          return escapeHtml((node as unknown as { value: string }).value)
        }
        return ""
    }
  }

  toAst(platformText: string): Root {
    return this.toAstWithEntities(platformText)
  }

  toAstWithEntities(platformText: string, entities?: TelegramEntity[]): Root {
    if (!platformText) {
      return { type: "root", children: [] }
    }
    const children = parseEntitiesToAst(platformText, entities)

    if (children.length === 1 && children[0]!.type === "paragraph") {
      return { type: "root", children: children[0] ? [children[0]] : [] }
    }

    return {
      type: "root",
      children: [{ type: "paragraph", children } as Paragraph],
    }
  }
}
