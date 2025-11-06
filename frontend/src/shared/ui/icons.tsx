import { SVGProps } from "react";

const defaultProps = {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
};

export const FireIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} {...defaultProps} {...props}>
    <path
      d="M15.3622 5.21361C18.2427 6.50069 20.25 9.39075 20.25 12.7497C20.25 17.306 16.5563 20.9997 12 20.9997C7.44365 20.9997 3.75 17.306 3.75 12.7497C3.75 10.5376 4.62058 8.52889 6.03781 7.04746C6.8043 8.11787 7.82048 8.99731 9.00121 9.60064C9.04632 6.82497 10.348 4.35478 12.3621 2.73413C13.1255 3.75788 14.1379 4.61821 15.3622 5.21361Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 18C14.0711 18 15.75 16.3211 15.75 14.25C15.75 12.3467 14.3321 10.7746 12.4949 10.5324C11.4866 11.437 10.7862 12.6779 10.5703 14.0787C9.78769 13.8874 9.06529 13.5425 8.43682 13.0779C8.31559 13.4467 8.25 13.8407 8.25 14.25C8.25 16.3211 9.92893 18 12 18Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const CoachIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...defaultProps} {...props}>
    <path d="M6 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 17h-2v-11a1 1 0 0 1 1 -1h14a5 7 0 0 1 5 7v5h-2m-4 0h-8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 5l1.5 7l4.5 0" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 10l15 0" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 5l0 5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 5l0 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const TrainIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...defaultProps} {...props}>
    <path d="M21 13c0 -3.87 -3.37 -7 -10 -7h-8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 15h16a2 2 0 0 0 2 -2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 6v5h17.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 11v4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 11v-5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 11v-4.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 19h18" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const KitchenIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...defaultProps} {...props}>
    <path
      d="M12 3c1.918 0 3.52 1.35 3.91 3.151a4 4 0 0 1 2.09 7.723l0 7.126h-12v-7.126a4 4 0 1 1 2.092 -7.723a4 4 0 0 1 3.908 -3.151z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M6.161 17.009l11.839 -.009" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const HotWaterIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...defaultProps} {...props}>
    <path d="M10 13.5a4 4 0 1 0 4 0v-8.5a2 2 0 0 0 -4 0v8.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 9l4 0" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
