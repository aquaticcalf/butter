import { BaseFormatConverter, type FormatConverter } from "chat"
import type { Root as MdastRoot, Content as MdastContent, Text as MdastText, Paragraph, Strong, Emphasis, Delete, InlineCode, Code as MdastCode, Link } from "chat"
import type { RootContent, Text, Bold, Italic, Underline, Strikethrough, Spoiler, Code, Pre, TextLink, TextMention } from "@qz/tgast"

export interface TelegramEntity {
  type: string
  offset: number
  length: number
  url?: string
  language?: string
  custom_emoji_id?: string
  user?: { id: number; first_name: string; is_bot?: boolean }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function tgastText(value: string): Text {
  return { type: "text", value }
}

function childrenValue(children: RootContent[]): string {
  return children.map((c) => ("value" in c ? c.value : "")).join("")
}

function parseEntitiesToTgast(text: string, entities?: TelegramEntity[]): RootContent[] {
  if (!entities || entities.length === 0) {
    return [tgastText(text)]
  }

  const sorted = [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length)

  const result: RootContent[] = []
  let pos = 0
  const stack: { entity: TelegramEntity; children: RootContent[] }[] = []

  for (const entity of sorted) {
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!
      const topEnd = top.entity.offset + top.entity.length
      if (entity.offset >= topEnd) {
        const topNode = stack.pop()!
        const node = buildTgastNode(topNode.entity, topNode.children)
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
      const raw = tgastText(text.slice(pos, entity.offset))
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
      top.children.push(tgastText(text.slice(pos, topEnd)))
      pos = topEnd
    }
    const node = buildTgastNode(top.entity, top.children)
    if (stack.length > 0) {
      stack[stack.length - 1]!.children.push(node)
    } else {
      result.push(node)
    }
  }

  if (pos < text.length) {
    result.push(tgastText(text.slice(pos)))
  }

  return mergeAdjacentText(result)
}

function mergeAdjacentText(children: RootContent[]): RootContent[] {
  const result: RootContent[] = []
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

function buildTgastNode(entity: TelegramEntity, children: RootContent[]): RootContent {
  switch (entity.type) {
    case "bold":
      return { type: "bold", children } as Bold
    case "italic":
      return { type: "italic", children } as Italic
    case "underline":
      return { type: "underline", children } as Underline
    case "strikethrough":
      return { type: "strikethrough", children } as Strikethrough
    case "spoiler":
      return { type: "spoiler", children } as Spoiler
    case "code":
      return { type: "code", value: childrenValue(children) } as Code
    case "pre":
      return { type: "pre", value: childrenValue(children), language: entity.language } as Pre
    case "text_link":
      return { type: "text_link", value: childrenValue(children), url: entity.url || "" } as TextLink
    case "text_mention":
      return { type: "text_mention", value: childrenValue(children), user: { id: entity.user?.id ?? 0, first_name: entity.user?.first_name ?? "", is_bot: entity.user?.is_bot } } as TextMention
    default:
      return children.length > 0 ? children[0]! : tgastText("")
  }
}

function tgastToMdast(children: RootContent[]): MdastContent[] {
  return children.map((node): MdastContent => {
    switch (node.type) {
      case "bold":
        return { type: "strong", children: tgastToMdast(node.children) } as Strong
      case "italic":
        return { type: "emphasis", children: tgastToMdast(node.children) } as Emphasis
      case "underline":
        return { type: "text", value: childrenValue(node.children) } as MdastText
      case "strikethrough":
        return { type: "delete", children: tgastToMdast(node.children) } as Delete
      case "spoiler":
        return { type: "text", value: childrenValue(node.children) } as MdastText
      case "code":
        return { type: "inlineCode", value: node.value } as InlineCode
      case "pre":
        return { type: "code", lang: node.language || null, value: node.value } as MdastCode
      case "text_link":
        return { type: "link", url: node.url, children: [{ type: "text", value: node.value }] } as Link
      case "text_mention":
        return { type: "link", url: `tg://user?id=${node.user.id}`, children: [{ type: "text", value: node.value }] } as Link
      case "text":
        return { type: "text", value: node.value } as MdastText
      default:
        if ("value" in node && typeof node.value === "string") {
          return { type: "text", value: node.value } as MdastText
        }
        return { type: "text", value: "" } as MdastText
    }
  })
}

export class TelegramConverter extends BaseFormatConverter implements FormatConverter {
  fromAst(ast: MdastRoot): string {
    return ast.children.map((child: MdastContent) => this.mdastNodeToHtml(child)).join("\n\n")
  }

  private mdastNodeToHtml(node: MdastContent): string {
    const n = node as unknown as { type: string; children?: MdastContent[]; value?: string; lang?: string; url?: string; ordered?: boolean }
    switch (n.type) {
      case "paragraph":
        return n.children!.map((c: MdastContent) => this.mdastNodeToHtml(c)).join("")

      case "text":
        return escapeHtml(n.value!)

      case "strong":
        return `<b>${n.children!.map((c: MdastContent) => this.mdastNodeToHtml(c)).join("")}</b>`

      case "emphasis":
        return `<i>${n.children!.map((c: MdastContent) => this.mdastNodeToHtml(c)).join("")}</i>`

      case "underline":
        return `<u>${n.children!.map((c: MdastContent) => this.mdastNodeToHtml(c)).join("")}</u>`

      case "delete":
        return `<s>${n.children!.map((c: MdastContent) => this.mdastNodeToHtml(c)).join("")}</s>`

      case "inlineCode":
        return `<code>${escapeHtml(n.value!)}</code>`

      case "code":
        if (n.lang) {
          return `<pre><code class="language-${escapeHtml(n.lang)}">${escapeHtml(n.value!)}</code></pre>`
        }
        return `<pre>${escapeHtml(n.value!)}</pre>`

      case "link":
        return `<a href="${escapeHtml(n.url!)}">${n.children!.map((c: MdastContent) => this.mdastNodeToHtml(c)).join("")}</a>`

      case "blockquote":
        return `<blockquote>${n.children!.map((c: MdastContent) => this.mdastNodeToHtml(c)).join("")}</blockquote>`

      case "list":
        return n.children!
          .map((item: MdastContent, i: number) => {
            if (item.type !== "listItem") return ""
            const prefix = n.ordered ? `${i + 1}. ` : "• "
            return (item as unknown as { children: MdastContent[] }).children!.map((c: MdastContent) => `${prefix}${this.mdastNodeToHtml(c)}`).join("\n")
          })
          .join("\n")

      case "listItem":
        return (n as unknown as { children: MdastContent[] }).children!.map((c: MdastContent) => this.mdastNodeToHtml(c)).join("")

      default:
        if ("children" in node) {
          return (node as unknown as { children: MdastContent[] }).children
            .map((c: MdastContent) => this.mdastNodeToHtml(c))
            .join("")
        }
        if ("value" in node) {
          return escapeHtml((node as unknown as { value: string }).value)
        }
        return ""
    }
  }

  toAst(platformText: string): MdastRoot {
    return this.toAstWithEntities(platformText)
  }

  toAstWithEntities(platformText: string, entities?: TelegramEntity[]): MdastRoot {
    if (!platformText) {
      return { type: "root", children: [] }
    }
    const tgastChildren = parseEntitiesToTgast(platformText, entities)
    const mdastChildren = tgastToMdast(tgastChildren)

    if (mdastChildren.length === 1 && mdastChildren[0]!.type === "paragraph") {
      return { type: "root", children: [mdastChildren[0]] }
    }

    return {
      type: "root",
      children: [{ type: "paragraph", children: mdastChildren } as Paragraph],
    }
  }
}
