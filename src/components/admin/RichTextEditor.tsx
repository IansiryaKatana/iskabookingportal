import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

const modules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ indent: "-1" }, { indent: "+1" }],
    [{ align: [] }],
    ["link"],
    ["clean"],
  ],
};

const formats = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "list",
  "bullet",
  "indent",
  "align",
  "link",
];

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
};

const RichTextEditor = ({
  value,
  onChange,
  onBlur,
  placeholder,
}: RichTextEditorProps) => (
  <div className="rich-text-editor overflow-hidden rounded-md border border-input bg-background">
    <ReactQuill
      theme="snow"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      modules={modules}
      formats={formats}
    />
  </div>
);

export default RichTextEditor;
