import {
  AlertTriangle, Bell, BookOpen, Calendar, CalendarDays, Check, CircleCheck, FileText, Flag, FlaskConical,
  GraduationCap, Medal, MessageCircle, MessageSquare, Palette, PenLine, ScrollText, Sprout, Target, Tent,
  Trophy, Users, Signal, School, Lock, Mail, Phone, Smartphone, Clock, Star, Award, KeyRound, Info,
  CircleX, Sparkles, Heart, Camera, Megaphone, Link2, Printer, Paperclip, PartyPopper,
} from "lucide-react";

/**
 * Renders an interface glyph as a consistent line icon.
 *
 * Several screens (and some API payloads) describe meaning with an emoji.
 * The emoji stays the source of meaning; this maps the known ones onto the
 * design-system icon set so the interface never mixes emoji with icons.
 * Status dots become coloured dots. Unknown emoji render unchanged.
 */
const ICONS = {
  "⚠️": AlertTriangle, "⚠": AlertTriangle, "📅": Calendar, "🗓️": CalendarDays, "🗓": CalendarDays, "🎪": Tent,
  "✅": CircleCheck, "✓": Check, "✔️": Check, "🏁": Flag, "🏆": Trophy, "🎯": Target, "🌱": Sprout, "📝": PenLine,
  "📄": FileText, "📜": ScrollText, "🔔": Bell, "💬": MessageCircle, "💭": MessageSquare, "🥇": Medal, "🥈": Medal,
  "🥉": Medal, "🎖️": Award, "🎖": Award, "📚": BookOpen, "📖": BookOpen, "✍️": PenLine, "✍": PenLine, "🔬": FlaskConical,
  "🎨": Palette, "🎓": GraduationCap, "👨‍👩‍👧": Users, "👪": Users, "📶": Signal, "🏫": School, "🔒": Lock, "🔐": Lock,
  "✉️": Mail, "📧": Mail, "📞": Phone, "📱": Smartphone, "⏳": Clock, "⏰": Clock, "⭐": Star, "🌟": Sparkles,
  "🔑": KeyRound, "ℹ️": Info, "❌": CircleX, "❤️": Heart, "📷": Camera, "📸": Camera, "📣": Megaphone, "📢": Megaphone,
  "🔗": Link2, "🖨️": Printer, "🖨": Printer, "📎": Paperclip, "🎉": PartyPopper,
};
const DOTS = { "🔴": "bg-danger", "🟡": "bg-warning", "🟠": "bg-warning", "🟢": "bg-success", "🔵": "bg-brand", "⚪": "bg-subtle" };

export default function Glyph({ emoji, className = "" }) {
  if (!emoji) return null;
  const key = String(emoji).trim();
  if (DOTS[key]) return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOTS[key]} ${className}`} />;
  const Icon = ICONS[key] || ICONS[key.replace(/️/g, "")];
  if (Icon) return <Icon aria-hidden="true" className={className} />;
  return <span aria-hidden="true" className={className}>{emoji}</span>;
}
