import TextType from "@/components/TextType.jsx";

type TypingTitleProps = {
  text: string;
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";
  className?: string;
  typingSpeed?: number;
  initialDelay?: number;
  showCursor?: boolean;
};

export default function TypingTitle({
  text,
  as = "h2",
  className,
  typingSpeed = 34,
  initialDelay = 0,
  showCursor = false,
}: TypingTitleProps) {
  return (
    <TextType
      as={as}
      text={text}
      className={className}
      typingSpeed={typingSpeed}
      initialDelay={initialDelay}
      loop={false}
      pauseDuration={0}
      deletingSpeed={typingSpeed}
      showCursor={showCursor}
      hideCursorWhileTyping={!showCursor}
      startOnVisible
    />
  );
}

