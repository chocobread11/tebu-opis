import { z } from 'zod'
import { orderRemarksMaxLength } from '../../shared/order'

export const orderRemarksInput = z.string().trim().max(orderRemarksMaxLength).nullable()
