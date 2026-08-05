'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { Extension } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { uploadImage } from '@/lib/tenants-admin';

/** Font-size as a TextStyle attribute (TipTap v2 has no official extension). */
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: any) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
        },
      },
    }];
  },
});

const SIZES = ['12px', '13px', '14px', '16px', '18px', '20px', '24px'];

/** WYSIWYG editor (TipTap, MIT) — headings, align, color/highlight, font size, images, tables, source view. */
export function RichText({ value, onChange, minHeight = 150 }: { value: string; onChange: (html: string) => void; minHeight?: number }) {
  const [source, setSource] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle, FontSize, Color,
      Highlight.configure({ multicolor: false }),
      Image.configure({ inline: false }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: { attributes: { class: 'rt-content' } },
  });

  // sync when the value changes from outside (load / reset / leaving source view)
  useEffect(() => {
    if (editor && !source && value !== editor.getHTML()) editor.commands.setContent(value || '', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor, source]);

  const onImageFile = async (file?: File | null) => {
    if (!file || !editor) return;
    try {
      const url = await uploadImage(file); // admin upload (ipos.manage)
      editor.chain().focus().setImage({ src: url }).run();
    } catch {
      const url = typeof window !== 'undefined' ? window.prompt('Image URL (upload not permitted for this account)') : '';
      if (url) editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const Btn = ({ on, cmd, title, children }: { on?: boolean; cmd: () => void; title: string; children: React.ReactNode }) => (
    <button type="button" className={`rt-btn${on ? ' on' : ''}`} title={title} onMouseDown={(e) => e.preventDefault()} onClick={cmd} disabled={!editor}>{children}</button>
  );

  const block = editor?.isActive('heading', { level: 1 }) ? 'h1'
    : editor?.isActive('heading', { level: 2 }) ? 'h2'
    : editor?.isActive('heading', { level: 3 }) ? 'h3' : 'p';

  return (
    <div className="rte">
      <div className="rte-bar">
        <select className="rt-sel" title="Paragraph style" value={block} disabled={!editor}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'p') editor?.chain().focus().setParagraph().run();
            else editor?.chain().focus().toggleHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
          }}>
          <option value="p">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option>
        </select>
        <select className="rt-sel" title="Font size" value={(editor?.getAttributes('textStyle')?.fontSize as string) ?? ''} disabled={!editor}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) editor?.chain().focus().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
            else editor?.chain().focus().setMark('textStyle', { fontSize: v }).run();
          }}>
          <option value="">Size</option>{SIZES.map((s) => <option key={s} value={s}>{s.replace('px', '')}</option>)}
        </select>
        <span className="rte-sep" />
        <Btn on={editor?.isActive('bold')} cmd={() => editor?.chain().focus().toggleBold().run()} title="Bold"><b>B</b></Btn>
        <Btn on={editor?.isActive('italic')} cmd={() => editor?.chain().focus().toggleItalic().run()} title="Italic"><i>I</i></Btn>
        <Btn on={editor?.isActive('underline')} cmd={() => editor?.chain().focus().toggleUnderline().run()} title="Underline"><span style={{ textDecoration: 'underline' }}>U</span></Btn>
        <Btn on={editor?.isActive('strike')} cmd={() => editor?.chain().focus().toggleStrike().run()} title="Strikethrough"><s>S</s></Btn>
        <label className="rt-btn" title="Text colour" style={{ padding: '2px 6px' }}>
          A<input type="color" style={{ width: 16, height: 14, border: 0, padding: 0, background: 'transparent', cursor: 'pointer' }}
            value={(editor?.getAttributes('textStyle')?.color as string) ?? '#111111'}
            onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()} />
        </label>
        <Btn on={editor?.isActive('highlight')} cmd={() => editor?.chain().focus().toggleHighlight().run()} title="Highlight"><span style={{ background: '#fff3b0', padding: '0 3px' }}>H</span></Btn>
        <span className="rte-sep" />
        <Btn on={editor?.isActive({ textAlign: 'left' })} cmd={() => editor?.chain().focus().setTextAlign('left').run()} title="Align left">⇤</Btn>
        <Btn on={editor?.isActive({ textAlign: 'center' })} cmd={() => editor?.chain().focus().setTextAlign('center').run()} title="Align centre">↔</Btn>
        <Btn on={editor?.isActive({ textAlign: 'right' })} cmd={() => editor?.chain().focus().setTextAlign('right').run()} title="Align right">⇥</Btn>
        <span className="rte-sep" />
        <Btn on={editor?.isActive('bulletList')} cmd={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet list">• List</Btn>
        <Btn on={editor?.isActive('orderedList')} cmd={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered list">1. List</Btn>
        <Btn on={editor?.isActive('blockquote')} cmd={() => editor?.chain().focus().toggleBlockquote().run()} title="Quote">❝</Btn>
        <span className="rte-sep" />
        <Btn cmd={() => { const url = typeof window !== 'undefined' ? window.prompt('Link URL') : ''; if (url) editor?.chain().focus().setLink({ href: url }).run(); }} title="Insert link">Link</Btn>
        <Btn cmd={() => imgRef.current?.click()} title="Insert image">Img</Btn>
        <input ref={imgRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => { onImageFile(e.target.files?.[0]); e.target.value = ''; }} />
        <Btn cmd={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert table">Table</Btn>
        <Btn cmd={() => editor?.chain().focus().addRowAfter().run()} title="Add row">＋Row</Btn>
        <Btn cmd={() => editor?.chain().focus().addColumnAfter().run()} title="Add column">＋Col</Btn>
        <Btn cmd={() => editor?.chain().focus().deleteRow().run()} title="Delete row">−Row</Btn>
        <Btn cmd={() => editor?.chain().focus().deleteColumn().run()} title="Delete column">−Col</Btn>
        <Btn cmd={() => editor?.chain().focus().deleteTable().run()} title="Delete table">✕ Table</Btn>
        <span className="rte-sep" />
        <Btn on={source} cmd={() => setSource((s) => !s)} title="Source HTML">Source</Btn>
      </div>
      {source ? (
        <textarea className="input rt-source" style={{ minHeight }} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div style={{ minHeight }} onClick={() => editor?.chain().focus().run()}>
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  );
}
