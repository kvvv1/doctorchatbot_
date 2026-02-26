import Image from 'next/image'

export default function BrandMark() {
	return (
		<div className="relative size-14">
			<Image
				src="/brand.png"
				alt="Marca"
				width={56}
				height={56}
				className="h-14 w-14 object-contain"
				priority
			/>
		</div>
	)
}
