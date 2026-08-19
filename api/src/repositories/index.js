import { config, usingSql } from '../config.js';
import { memoryRepository } from './memoryRepository.js';
import { sqlRepository } from './sqlRepository.js';

export const repository = usingSql() ? sqlRepository : memoryRepository;

export const describeProvider = () => ({
  configured: config.dataProvider,
  active: repository.name,
});
