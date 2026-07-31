import type { SVGProps } from 'react'

interface ServiceFyLogoProps extends Omit<SVGProps<SVGSVGElement>, 'role'> {
  decorative?: boolean
}

/**
 * Marca vetorial oficial do ServiceFY.
 *
 * O bloco S e o bloco FY compartilham a mesma silhueta, mas usam fundos
 * distintos para manter a leitura pedida pela identidade da marca.
 */
export default function ServiceFyLogo({ decorative = false, ...props }: ServiceFyLogoProps) {
  return (
    <svg
      viewBox="0 0 108 56"
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : 'ServiceFY'}
      aria-hidden={decorative ? true : undefined}
      {...props}
    >
      <path
        d="M12 0h34v56H12C5.373 56 0 50.627 0 44V12C0 5.373 5.373 0 12 0Z"
        fill="#F4C542"
      />
      <path
        d="M46 0h50c6.627 0 12 5.373 12 12v32c0 6.627-5.373 12-12 12H46V0Z"
        fill="#075985"
      />
      <path d="M46 9v38" stroke="#fff" strokeOpacity=".18" />
      <path
        d="M33 17c-2.2-2.4-5.5-3.5-9.4-3.5-5.1 0-8.6 2.2-8.6 5.8 0 3.3 2.6 4.7 8.6 5.8 6.1 1.1 8.9 2.8 8.9 6.3 0 4-3.7 6.6-9.4 6.6-4.3 0-7.8-1.4-10.1-4"
        fill="none"
        stroke="#071225"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.6"
      />
      <path d="M57 38V16h15M57 26.5h12" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
      <path d="m78 16 7 10 7-10M85 26v12" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
    </svg>
  )
}
