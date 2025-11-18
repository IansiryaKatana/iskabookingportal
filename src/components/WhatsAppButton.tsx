// Using inline SVG for WhatsApp brand icon (no extra deps)

const WhatsAppButton = () => {
  const whatsappNumber = "+447123456789"; // Replace with actual WhatsApp number
  const whatsappMessage = "Hi! I'd like to inquire about booking a studio at Urban Hub.";
  
  const handleClick = () => {
    const url = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(url, "_blank");
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-[#25D366] text-white shadow-lg hover:bg-[#128C7E] transition-all duration-300 hover:scale-110 flex items-center justify-center"
      aria-label="Contact us on WhatsApp"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="h-7 w-7"
        role="img"
        aria-label="WhatsApp icon"
        fill="currentColor"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.148-.67.15-.198.297-.767.967-.94 1.166-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.173.198-.297.298-.495.099-.198.05-.371-.025-.52-.074-.148-.669-1.612-.916-2.207-.242-.58-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.1 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.227 1.36.195 1.872.118.571-.085 1.758-.718 2.007-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 4.403h-.004a8.377 8.377 0 0 1-4.271-1.169l-.306-.182-3.176.833.847-3.104-.199-.318a8.411 8.411 0 0 1-1.295-4.471c0-4.674 3.805-8.476 8.485-8.476 2.268 0 4.4.885 6.002 2.486a8.401 8.401 0 0 1 2.489 6.003c-.003 4.674-3.807 8.478-8.472 8.478m7.143-15.621A9.86 9.86 0 0 0 12.05 0C5.495 0 .16 5.335.163 11.892c0 2.096.547 4.142 1.588 5.937L0 24l6.305-1.654a11.88 11.88 0 0 0 5.694 1.451h.005c6.555 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.455-8.34" />
      </svg>
    </button>
  );
};

export default WhatsAppButton;
