//! Markdown の簡易レンダラ。
//!
//! Slint の `StyledText` は強調・リンク・インラインコード・リストには対応しているが、
//! 見出し・表・引用・水平線には対応していない。そこでブロック構造は pulldown-cmark で
//! 分解して `MdBlock` の列にし、各ブロックのインライン部分だけを Markdown として
//! 組み立て直して `StyledText` に渡す。

use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use slint::{ModelRc, SharedString, StyledText, VecModel};

use crate::MdBlock;

/// UI 非依存のブロック表現（テスト容易性のため MdBlock と分けている）
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Block {
    pub kind: &'static str,
    /// インライン装飾を保った Markdown
    pub markdown: String,
    /// 装飾を落とした平文（StyledText に変換できなかった場合や表・コードで使う）
    pub plain: String,
    pub marker: String,
    pub depth: usize,
    pub cells: Vec<String>,
    pub header: bool,
}

struct ListState {
    ordered: bool,
    next: u64,
}

#[derive(Default)]
struct Builder {
    blocks: Vec<Block>,
    current: Option<Block>,
    lists: Vec<ListState>,
    quote_depth: usize,
    // 表
    row: Option<Vec<String>>,
    cell: Option<String>,
    in_table_head: bool,
    // リンクの URL（終了時に `](url)` を書くため）
    links: Vec<String>,
}

impl Builder {
    fn start_block(&mut self, kind: &'static str) {
        self.flush();
        self.current = Some(Block {
            kind,
            ..Default::default()
        });
    }

    fn flush(&mut self) {
        if let Some(block) = self.current.take() {
            let keep = match block.kind {
                "hr" => true,
                "code" => true,
                _ => !block.plain.trim().is_empty(),
            };
            if keep {
                self.blocks.push(block);
            }
        }
    }

    /// 段落テキストの書き込み先を用意する（リスト項目の中ならその項目へ書く）
    fn ensure_text_block(&mut self) {
        if self.current.is_none() {
            let kind = if self.quote_depth > 0 { "quote" } else { "p" };
            self.current = Some(Block {
                kind,
                ..Default::default()
            });
        }
    }

    fn push_inline(&mut self, markdown: &str, plain: &str) {
        if let Some(cell) = self.cell.as_mut() {
            cell.push_str(plain);
            return;
        }
        self.ensure_text_block();
        let block = self.current.as_mut().expect("text block");
        block.markdown.push_str(markdown);
        block.plain.push_str(plain);
    }
}

/// StyledText のパーサーに渡す前に、Markdown / HTML として解釈される文字をエスケープする
fn escape_inline(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        if matches!(
            c,
            '\\' | '*' | '_' | '`' | '[' | ']' | '<' | '>' | '~' | '#' | '!' | '|'
        ) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

pub fn parse(source: &str) -> Vec<Block> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);

    let mut b = Builder::default();
    for event in Parser::new_ext(source, options) {
        match event {
            Event::Start(tag) => match tag {
                Tag::Heading { level, .. } => b.start_block(match level {
                    HeadingLevel::H1 => "h1",
                    HeadingLevel::H2 => "h2",
                    _ => "h3",
                }),
                Tag::Paragraph => {
                    // リスト項目の最初の段落は項目の行にそのまま書く
                    let in_item_head = matches!(&b.current, Some(block) if block.kind == "li" && block.plain.is_empty());
                    if !in_item_head {
                        b.flush();
                    }
                }
                Tag::BlockQuote(_) => {
                    b.flush();
                    b.quote_depth += 1;
                }
                Tag::CodeBlock(_) => b.start_block("code"),
                Tag::List(start) => {
                    b.flush();
                    b.lists.push(ListState {
                        ordered: start.is_some(),
                        next: start.unwrap_or(1),
                    });
                }
                Tag::Item => {
                    let depth = b.lists.len().saturating_sub(1);
                    let marker = match b.lists.last_mut() {
                        Some(list) if list.ordered => {
                            let n = list.next;
                            list.next += 1;
                            format!("{n}.")
                        }
                        _ => "•".to_string(),
                    };
                    b.start_block("li");
                    if let Some(block) = b.current.as_mut() {
                        block.marker = marker;
                        block.depth = depth;
                    }
                }
                Tag::Table(_) => b.flush(),
                Tag::TableHead => {
                    b.in_table_head = true;
                    b.row = Some(Vec::new());
                }
                Tag::TableRow => b.row = Some(Vec::new()),
                Tag::TableCell => b.cell = Some(String::new()),
                Tag::Emphasis => b.push_inline("*", ""),
                Tag::Strong => b.push_inline("**", ""),
                Tag::Strikethrough => b.push_inline("~~", ""),
                Tag::Link { dest_url, .. } => {
                    b.links.push(dest_url.to_string());
                    b.push_inline("[", "");
                }
                Tag::Image { .. } => {}
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Heading(_) | TagEnd::CodeBlock | TagEnd::Item => b.flush(),
                TagEnd::Paragraph => {
                    // リスト項目内の段落は、項目が閉じるまでまとめておく
                    if !matches!(&b.current, Some(block) if block.kind == "li") {
                        b.flush();
                    }
                }
                TagEnd::BlockQuote(_) => {
                    b.flush();
                    b.quote_depth = b.quote_depth.saturating_sub(1);
                }
                TagEnd::List(_) => {
                    b.flush();
                    b.lists.pop();
                }
                TagEnd::TableCell => {
                    if let (Some(row), Some(cell)) = (b.row.as_mut(), b.cell.take()) {
                        row.push(cell.trim().to_string());
                    }
                }
                TagEnd::TableHead | TagEnd::TableRow => {
                    if let Some(cells) = b.row.take() {
                        b.blocks.push(Block {
                            kind: "row",
                            plain: cells.join(" | "),
                            cells,
                            header: b.in_table_head,
                            ..Default::default()
                        });
                    }
                    b.in_table_head = false;
                }
                TagEnd::Emphasis => b.push_inline("*", ""),
                TagEnd::Strong => b.push_inline("**", ""),
                TagEnd::Strikethrough => b.push_inline("~~", ""),
                TagEnd::Link => {
                    let url = b.links.pop().unwrap_or_default();
                    b.push_inline(&format!("]({})", url.replace(')', "%29")), "");
                }
                _ => {}
            },
            Event::Text(text) => {
                if matches!(&b.current, Some(block) if block.kind == "code") {
                    if let Some(block) = b.current.as_mut() {
                        block.plain.push_str(&text);
                    }
                } else {
                    b.push_inline(&escape_inline(&text), &text);
                }
            }
            Event::Code(code) => {
                let fence = if code.contains('`') { "`` " } else { "`" };
                let closing = if code.contains('`') { " ``" } else { "`" };
                b.push_inline(&format!("{fence}{code}{closing}"), &code);
            }
            Event::Html(html) | Event::InlineHtml(html) => {
                b.push_inline(&escape_inline(&html), &html);
            }
            Event::SoftBreak => b.push_inline(" ", " "),
            Event::HardBreak => b.push_inline("  \n", "\n"),
            Event::Rule => {
                b.flush();
                b.blocks.push(Block {
                    kind: "hr",
                    ..Default::default()
                });
            }
            Event::TaskListMarker(checked) => {
                let mark = if checked { "☑ " } else { "☐ " };
                b.push_inline(mark, mark);
            }
            _ => {}
        }
    }
    b.flush();
    for block in &mut b.blocks {
        if block.kind == "code" {
            // フェンスの直前の改行を落とす
            let trimmed = block.plain.trim_end_matches('\n').to_string();
            block.plain = trimmed;
        }
    }
    b.blocks
}

fn to_md_block(block: Block) -> MdBlock {
    // StyledText には見出しがないので、太字で代用する
    let markdown = if block.kind.starts_with('h') && !block.markdown.is_empty() {
        format!("**{}**", block.markdown)
    } else {
        block.markdown
    };
    let text = if markdown.is_empty() {
        StyledText::from_plain_text(&block.plain)
    } else {
        StyledText::from_markdown(&markdown)
            .unwrap_or_else(|_| StyledText::from_plain_text(&block.plain))
    };
    MdBlock {
        kind: block.kind.into(),
        text,
        plain: block.plain.into(),
        marker: block.marker.into(),
        depth: block.depth as i32,
        cells: ModelRc::new(VecModel::from(
            block
                .cells
                .into_iter()
                .map(SharedString::from)
                .collect::<Vec<_>>(),
        )),
        header: block.header,
    }
}

pub fn render(source: &str) -> ModelRc<MdBlock> {
    let blocks: Vec<MdBlock> = parse(source).into_iter().map(to_md_block).collect();
    ModelRc::new(VecModel::from(blocks))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(blocks: &[Block]) -> Vec<&'static str> {
        blocks.iter().map(|b| b.kind).collect()
    }

    #[test]
    fn splits_headings_paragraphs_and_rules() {
        let blocks = parse("# Title\n\nHello **world**\n\n---\n\n## Sub");
        assert_eq!(kinds(&blocks), vec!["h1", "p", "hr", "h2"]);
        assert_eq!(blocks[0].plain, "Title");
        assert_eq!(blocks[1].markdown, "Hello **world**");
        assert_eq!(blocks[1].plain, "Hello world");
    }

    #[test]
    fn lists_have_markers_and_depth() {
        let blocks = parse("- a\n- b\n  - c\n\n1. one\n2. two");
        assert_eq!(kinds(&blocks), vec!["li", "li", "li", "li", "li"]);
        assert_eq!(blocks[0].marker, "•");
        assert_eq!(blocks[2].plain, "c");
        assert_eq!(blocks[2].depth, 1);
        assert_eq!(blocks[3].marker, "1.");
        assert_eq!(blocks[4].marker, "2.");
    }

    #[test]
    fn code_blocks_keep_plain_text() {
        let blocks = parse("```\nlet x = *1*;\n```");
        assert_eq!(kinds(&blocks), vec!["code"]);
        assert_eq!(blocks[0].plain, "let x = *1*;");
    }

    #[test]
    fn tables_become_rows() {
        let blocks = parse("| a | b |\n|---|---|\n| 1 | **2** |");
        assert_eq!(kinds(&blocks), vec!["row", "row"]);
        assert!(blocks[0].header);
        assert_eq!(blocks[0].cells, vec!["a", "b"]);
        assert_eq!(blocks[1].cells, vec!["1", "2"]);
    }

    #[test]
    fn quotes_and_links() {
        let blocks = parse("> quoted [link](https://example.com)");
        assert_eq!(kinds(&blocks), vec!["quote"]);
        assert_eq!(blocks[0].markdown, "quoted [link](https://example.com)");
    }

    #[test]
    fn escapes_markup_in_text() {
        let blocks = parse("a \\*b\\* <u>c</u>");
        assert_eq!(blocks[0].plain, "a *b* <u>c</u>");
        assert!(blocks[0].markdown.contains("\\*b\\*"));
        assert!(blocks[0].markdown.contains("\\<u\\>"));
    }

    #[test]
    fn styled_text_accepts_generated_markdown() {
        for source in [
            "Hello **bold** *it* `code` ~~del~~ [l](https://x.y)",
            "- item with **bold**",
            "a <b> & c",
            "1. x\n2. y",
        ] {
            for block in parse(source) {
                if !block.markdown.is_empty() {
                    assert!(
                        StyledText::from_markdown(&block.markdown).is_ok(),
                        "failed: {:?}",
                        block.markdown
                    );
                }
            }
        }
    }
}
