declare module "mdast" {
  export interface Root { type: "root"; children: Content[] }
  export interface Paragraph { type: "paragraph"; children: Content[] }
  export interface Text { type: "text"; value: string }
  export interface Strong { type: "strong"; children: Content[] }
  export interface Emphasis { type: "emphasis"; children: Content[] }
  export interface Delete { type: "delete"; children: Content[] }
  export interface InlineCode { type: "inlineCode"; value: string }
  export interface Code { type: "code"; lang?: string; value: string }
  export interface Link { type: "link"; url: string; children: Content[] }
  export interface Blockquote { type: "blockquote"; children: Content[] }
  export interface List { type: "list"; ordered?: boolean; children: ListItem[] }
  export interface ListItem { type: "listItem"; children: Content[] }
  export type Content = Paragraph | Text | Strong | Emphasis | Delete | InlineCode | Code | Link | Blockquote | List | ListItem
}
