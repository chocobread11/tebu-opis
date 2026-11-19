import { randomUUID } from 'node:crypto'
import { createMediaStorage } from '../../../../storage/media'
import { prepareUploadedImage } from '../../../../utils/upload-image'
import { imageUploadLimit, imageMimeTypes } from '../../../../../shared/media'
export default defineEventHandler(async event => {
  requireAdmin(event)
  const productId = getRouterParam(event,'id') || ''
  if (!await db().product.findUnique({ where: { id:productId } })) throw createError({ statusCode:404, message:'Product not found.' })
  const file = (await readMultipartFormData(event))?.find(part => part.name==='file')
  if (!file || !(imageMimeTypes as readonly string[]).includes(file.type || '') || file.data.length >= imageUploadLimit) throw createError({ statusCode:400, message:'Choose a JPG, PNG or WebP image smaller than 250 KB.' })
  let bytes: Buffer
  try { bytes=await prepareUploadedImage(file.data) } catch { throw createError({ statusCode:400, message:'This image could not be verified.' }) }
  const storage=createMediaStorage(useRuntimeConfig()), id=randomUUID()
  let filename: string | undefined
  try {
    filename=await storage.write(`${id}.webp`,bytes,'product')
    await db().$transaction(async tx => {
      await lockProducts(tx, [productId])
      const before = await tx.product.findUniqueOrThrow({ where: { id: productId } })
      await tx.media.create({ data:{ id,filename:filename!,kind:'product',productId } })
      const product = await tx.product.update({ where:{ id:productId },data:{ imageId:id } })
      await recordAudit(tx, 'product', productId, 'image_changed', before, product)
    })
    return { id,url:`/api/media/${id}` }
  } catch(error) { if(filename) await storage.remove(filename).catch(()=>{}); throw createError({ statusCode:503,message:'Could not save the product image. Check upload storage and try again.' }) }
  finally { storage.close() }
})
