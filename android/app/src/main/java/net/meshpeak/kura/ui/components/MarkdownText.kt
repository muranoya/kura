package net.meshpeak.kura.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import org.commonmark.node.*
import org.commonmark.parser.Parser

@Composable
fun MarkdownText(
    text: String,
    modifier: Modifier = Modifier
) {
    val nodes = remember(text) {
        val parser = Parser.builder().build()
        val document = parser.parse(text)
        flattenNodes(document)
    }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        for (node in nodes) {
            when (node) {
                is MarkdownBlock.Heading -> {
                    val style = when (node.level) {
                        1 -> MaterialTheme.typography.titleLarge
                        2 -> MaterialTheme.typography.titleMedium
                        else -> MaterialTheme.typography.titleSmall
                    }
                    Text(
                        text = buildInlineAnnotatedString(node.inlines),
                        style = style,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                is MarkdownBlock.Paragraph -> {
                    Text(
                        text = buildInlineAnnotatedString(node.inlines),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                is MarkdownBlock.CodeBlock -> {
                    Text(
                        text = node.literal,
                        style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                is MarkdownBlock.ListItem -> {
                    Text(
                        text = buildAnnotatedString {
                            append(node.bullet)
                            append(buildInlineAnnotatedString(node.inlines))
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                is MarkdownBlock.ThematicBreak -> {
                    Spacer(modifier = Modifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
private fun buildInlineAnnotatedString(inlines: List<MarkdownInline>) = buildAnnotatedString {
    for (inline in inlines) {
        when (inline) {
            is MarkdownInline.Plain -> append(inline.text)
            is MarkdownInline.Bold -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(inline.text) }
            is MarkdownInline.Italic -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(inline.text) }
            is MarkdownInline.Code -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) { append(inline.text) }
            is MarkdownInline.Link -> withStyle(SpanStyle(textDecoration = TextDecoration.Underline)) { append(inline.text) }
        }
    }
}

// Internal model

private sealed class MarkdownBlock {
    data class Heading(val level: Int, val inlines: List<MarkdownInline>) : MarkdownBlock()
    data class Paragraph(val inlines: List<MarkdownInline>) : MarkdownBlock()
    data class CodeBlock(val literal: String) : MarkdownBlock()
    data class ListItem(val bullet: String, val inlines: List<MarkdownInline>) : MarkdownBlock()
    data object ThematicBreak : MarkdownBlock()
}

private sealed class MarkdownInline {
    data class Plain(val text: String) : MarkdownInline()
    data class Bold(val text: String) : MarkdownInline()
    data class Italic(val text: String) : MarkdownInline()
    data class Code(val text: String) : MarkdownInline()
    data class Link(val text: String, val url: String) : MarkdownInline()
}

private fun flattenNodes(document: Node): List<MarkdownBlock> {
    val blocks = mutableListOf<MarkdownBlock>()
    var child = document.firstChild
    var listIndex = 0
    while (child != null) {
        when (child) {
            is org.commonmark.node.Heading -> {
                blocks.add(MarkdownBlock.Heading(child.level, extractInlines(child)))
            }
            is org.commonmark.node.Paragraph -> {
                blocks.add(MarkdownBlock.Paragraph(extractInlines(child)))
            }
            is FencedCodeBlock -> {
                blocks.add(MarkdownBlock.CodeBlock(child.literal.trimEnd()))
            }
            is IndentedCodeBlock -> {
                blocks.add(MarkdownBlock.CodeBlock(child.literal.trimEnd()))
            }
            is BulletList -> {
                var item = child.firstChild
                while (item != null) {
                    if (item is org.commonmark.node.ListItem) {
                        val inlines = extractListItemInlines(item)
                        blocks.add(MarkdownBlock.ListItem("  \u2022 ", inlines))
                    }
                    item = item.next
                }
            }
            is OrderedList -> {
                listIndex = child.markerStartNumber
                var item = child.firstChild
                while (item != null) {
                    if (item is org.commonmark.node.ListItem) {
                        val inlines = extractListItemInlines(item)
                        blocks.add(MarkdownBlock.ListItem("  ${listIndex}. ", inlines))
                        listIndex++
                    }
                    item = item.next
                }
            }
            is org.commonmark.node.ThematicBreak -> {
                blocks.add(MarkdownBlock.ThematicBreak)
            }
            is BlockQuote -> {
                // Flatten blockquote children as paragraphs
                var bqChild = child.firstChild
                while (bqChild != null) {
                    if (bqChild is org.commonmark.node.Paragraph) {
                        val inlines = mutableListOf<MarkdownInline>()
                        inlines.add(MarkdownInline.Italic("> "))
                        inlines.addAll(extractInlines(bqChild).map {
                            when (it) {
                                is MarkdownInline.Plain -> MarkdownInline.Italic(it.text)
                                else -> it
                            }
                        })
                        blocks.add(MarkdownBlock.Paragraph(inlines))
                    }
                    bqChild = bqChild.next
                }
            }
        }
        child = child.next
    }
    return blocks
}

private fun extractListItemInlines(item: org.commonmark.node.ListItem): List<MarkdownInline> {
    val inlines = mutableListOf<MarkdownInline>()
    var child = item.firstChild
    while (child != null) {
        if (child is org.commonmark.node.Paragraph) {
            inlines.addAll(extractInlines(child))
        }
        child = child.next
    }
    return inlines
}

private fun extractInlines(node: Node): List<MarkdownInline> {
    val inlines = mutableListOf<MarkdownInline>()
    var child = node.firstChild
    while (child != null) {
        when (child) {
            is Text -> inlines.add(MarkdownInline.Plain(child.literal))
            is SoftLineBreak -> inlines.add(MarkdownInline.Plain(" "))
            is HardLineBreak -> inlines.add(MarkdownInline.Plain("\n"))
            is StrongEmphasis -> {
                val text = extractPlainText(child)
                inlines.add(MarkdownInline.Bold(text))
            }
            is Emphasis -> {
                val text = extractPlainText(child)
                inlines.add(MarkdownInline.Italic(text))
            }
            is Code -> inlines.add(MarkdownInline.Code(child.literal))
            is org.commonmark.node.Link -> {
                val text = extractPlainText(child)
                inlines.add(MarkdownInline.Link(text, child.destination))
            }
        }
        child = child.next
    }
    return inlines
}

private fun extractPlainText(node: Node): String {
    val sb = StringBuilder()
    var child = node.firstChild
    while (child != null) {
        when (child) {
            is Text -> sb.append(child.literal)
            is SoftLineBreak -> sb.append(" ")
            is Code -> sb.append(child.literal)
            else -> sb.append(extractPlainText(child))
        }
        child = child.next
    }
    return sb.toString()
}
