import { Instagram, Linkedin, Facebook } from "lucide-react";

const socials = [
  {
    name: "Instagram",
    href: "https://www.instagram.com/urbanhub",
    bg: "bg-[#E4405F]",
    icon: <Instagram className="h-5 w-5" />,
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@urbanhub",
    bg: "bg-[#010101]",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path
          d="M20 8.23a5.37 5.37 0 0 1-3.32-1.15v7.07a5.86 5.86 0 1 1-5.86-5.86 5.55 5.55 0 0 1 1.18.12v2.41a2.94 2.94 0 1 0 1.59 2.63V3.5h2.36a5.36 5.36 0 0 0 4.05 3.85Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/company/urbanhub",
    bg: "bg-[#0A66C2]",
    icon: <Linkedin className="h-5 w-5" />,
  },
  {
    name: "Facebook",
    href: "https://www.facebook.com/urbanhub",
    bg: "bg-[#1877F2]",
    icon: <Facebook className="h-5 w-5" />,
  },
];

const FloatingContactRail = () => (
  <div className="fixed right-4 top-1/2 z-30 -translate-y-1/2 hidden flex-col items-center gap-2 xl:flex">
    <div className="flex flex-col items-center gap-2 rounded-full border border-border/60 bg-background/90 px-3 py-4 shadow-lg backdrop-blur">
      {socials.map((social) => (
        <a
          key={social.name}
          href={social.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={social.name}
          className={`flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform duration-200 hover:scale-110 ${social.bg}`}
        >
          {social.icon}
        </a>
      ))}
    </div>
  </div>
);

export default FloatingContactRail;
