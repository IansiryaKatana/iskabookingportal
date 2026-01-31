import { useMemo } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { cn } from "@/lib/utils";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
};

const modules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ indent: "-1" }, { indent: "+1" }],
    ["link", "blockquote"],
    ["clean"],
  ],
};

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write content...",
  className,
  minHeight = "280px",
}: RichTextEditorProps) {
  const quillModules = useMemo(() => modules, []);

  return (
    <div className={cn("rich-text-editor rounded-md border bg-background", className)}>
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={quillModules}
        placeholder={placeholder}
        className="[&_.ql-container]:min-h-[200px] [&_.ql-editor]:min-h-[200px]"
        style={{ minHeight }}
      />
    </div>
  );
}
