import type { SVGProps } from 'react'

interface ServiceFyLogoProps extends Omit<SVGProps<SVGSVGElement>, 'role'> {
  decorative?: boolean
}

/**
 * Marca vetorial oficial do ServiceFY.
 *
 * Dois módulos independentes mantêm S e FY unidos como sistema, mas
 * separados na leitura. A tipografia usa a família estrutural do produto.
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
      <rect x="0" y="0" width="46" height="56" rx="12" fill="#F4C542" />
      <rect x="50" y="0" width="58" height="56" rx="12" fill="#075985" />
      <text
        x="23"
        y="40"
        fill="#071225"
        fontFamily="Hanken Grotesk, Arial, sans-serif"
        fontSize="34"
        fontWeight="850"
        textAnchor="middle"
      >
        S
      </text>
      <text
        x="79"
        y="39"
        fill="#FFFFFF"
        fontFamily="Hanken Grotesk, Arial, sans-serif"
        fontSize="30"
        fontWeight="850"
        letterSpacing="-1.6"
        textAnchor="middle"
      >
        FY
      </text>
    </svg>
  )
}
