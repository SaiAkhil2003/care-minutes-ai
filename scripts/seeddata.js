import { getRepository, getRepositoryMode, resetRepository } from '../backend/src/data/repository.js'

process.env.DATA_PROVIDER = process.env.DATA_PROVIDER ?? 'file'
resetRepository()

const repository = getRepository()
const facilities = await repository.listFacilities()

console.log(`Seed data ready using ${getRepositoryMode()} mode.`)
console.log(`Facilities available: ${facilities.length}`)
