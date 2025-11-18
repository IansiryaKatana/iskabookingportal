type BannerMessage = {
  icon?: string;
  text: string;
};

type PaymentBannerProps = {
  messages?: BannerMessage[];
};

const defaultMessages: BannerMessage[] = Array.from({ length: 6 }, () => ({
  icon: "💳",
  text: "we accept payments in instalments",
}));

const PaymentBanner = ({ messages }: PaymentBannerProps) => {
  const rawMethods =
    messages && messages.length > 0 ? messages : defaultMessages;

  const paymentMethods = rawMethods.map((method) => {
    const text = method.text ?? "we accept payments in instalments";
    const normalized = text.toLowerCase();
    return {
      icon: method.icon ?? "💳",
      text: normalized.charAt(0).toUpperCase() + normalized.slice(1),
    };
  });

  const marqueeItems = [...paymentMethods, ...paymentMethods, ...paymentMethods];

  return (
    <div className="bg-accent-yellow text-black py-3 overflow-hidden">
      <div className="relative flex">
        <div className="flex animate-marquee whitespace-nowrap">
          {marqueeItems.map((method, index) => (
          <div
            key={`first-${index}`}
            className="flex items-center gap-2 mr-10"
          >
            <span className="text-2xl leading-none">
              {method.icon ?? "💳"}
            </span>
            <span className="font-medium text-sm md:text-base leading-none tracking-wide">
              {method.text}
            </span>
          </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PaymentBanner;
