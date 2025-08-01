import { sequelize } from '../../config/database.js';
import ChatHistoryModel from './Communication/ChatHistoryModel.js';
import ChatHistoryContactsModel from './Communication/ChatHistoryContactsModel.js';
import ClinicModel from './Clinics/ClinicModel.js';
import ContactModel from './Communication/ContactModel.js';
import PaymentMethodModel from './Payments/PaymentMethodModel.js';
import PaymentStatusModel from './Payments/PaymentStatusModel.js';
import PetBloodTypeModel from './Pets/PetBloodTypeModel.js';
import PetBreedModel from './Pets/PetBreedModel.js';
import PetColorModel from './Pets/PetColorModel.js';
import PetFurLengthModel from './Pets/PetFurLengthModel.js';
import PetFurTypeModel from './Pets/PetFurTypeModel.js';
import PetGenderModel from './Pets/PetGenderModel.js';
import PetLivingEnvironmentModel from './Pets/PetLivingEnvironmentModel.js';
import PetModel from './Pets/PetModel.js';
import PetOwnerModel from './PetOwners/PetOwnerModel.js';
import PetOwnerPetModel from './PetOwners/PetOwnerModel.js';
import PetOwnerTagModel from './PetOwners/PetOwnerTagModel.js';
import PetOwnerTagAssignmentModel from './PetOwners/PetOwnerTagAssignmentModel.js';
import PetSizeModel from './Pets/PetSizeModel.js';
import PetSocializationLevelModel from './Pets/PetSocializationLevelModel.js';
import PetTemperamentModel from './Pets/PetTemperamentModel.js';
import PetTypeModel from './Pets/PetTypeModel.js';
import PlanModel from './Plans/PlanModel.js';
import ProtocolModel from './Protocols/ProtocolModel.js';
import SchedulingModel from './Scheduling/SchedulingModel.js';
import SchedulingStatusModel from './Scheduling/SchedulingStatusModel.js';
import ServiceTypeModel from './Services/ServiceType.js';
import UserModel from './Users/UserModel.js';
import RoleModel from './Users/RoleModel.js';
import VaccineModel from './Medications/VaccineModel.js';

const models = {
  ChatHistory: ChatHistoryModel(sequelize),
  ChatHistoryContacts: ChatHistoryContactsModel(sequelize),
  Clinic: ClinicModel(sequelize),
  Contact: ContactModel(sequelize),
  PaymentMethod: PaymentMethodModel(sequelize),
  PaymentStatus: PaymentStatusModel(sequelize),
  Pet: PetModel(sequelize),
  PetBloodType: PetBloodTypeModel(sequelize),
  PetBreed: PetBreedModel(sequelize),
  PetColor: PetColorModel(sequelize),
  PetFurLength: PetFurLengthModel(sequelize),
  PetFurType: PetFurTypeModel(sequelize),
  PetGender: PetGenderModel(sequelize),
  PetLivingEnvironment: PetLivingEnvironmentModel(sequelize),
  PetOwner: PetOwnerModel(sequelize),
  PetOwnerPet: PetOwnerPetModel(sequelize),
  PetOwnerTag: PetOwnerTagModel(sequelize),
  PetOwnerTagAssignment: PetOwnerTagAssignmentModel(sequelize),
  PetSize: PetSizeModel(sequelize),
  PetSocializationLevel: PetSocializationLevelModel(sequelize),
  PetTemperament: PetTemperamentModel(sequelize),
  PetType: PetTypeModel(sequelize),
  Plan: PlanModel(sequelize),
  Protocol: ProtocolModel(sequelize),
  Scheduling: SchedulingModel(sequelize),
  SchedulingStatus: SchedulingStatusModel(sequelize),
  ServiceType: ServiceTypeModel(sequelize),
  User: UserModel(sequelize),
  Role: RoleModel(sequelize),
  Vaccine: VaccineModel(sequelize),
};

Object.keys(models).forEach((modelName) => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

export const ChatHistory = models.ChatHistory;
export const ChatHistoryContacts = models.ChatHistoryContacts;
export const Clinic = models.Clinic;
export const Contact = models.Contact;
export const PaymentMethod = models.PaymentMethod;
export const PaymentStatus = models.PaymentStatus;
export const Pet = models.Pet;
export const PetBloodType = models.PetBloodType;
export const PetBreed = models.PetBreed;
export const PetColor = models.PetColor;
export const PetFurLength = models.PetFurLength;
export const PetFurType = models.PetFurType;
export const PetGender = models.PetGender;
export const PetLivingEnvironment = models.PetLivingEnvironment;
export const PetOwner = models.PetOwner;
export const PetOwnerPet = models.PetOwnerPet;
export const PetOwnerTag = models.PetOwnerTag;
export const PetOwnerTagAssignment = models.PetOwnerTagAssignment;
export const PetSize = models.PetSize;
export const PetSocializationLevel = models.PetSocializationLevel;
export const PetTemperament = models.PetTemperament;
export const PetType = models.PetType;
export const Plan = models.Plan;
export const Protocol = models.Protocol;
export const Scheduling = models.Scheduling;
export const SchedulingStatus = models.SchedulingStatus;
export const ServiceType = models.ServiceType;
export const User = models.User;
export const Role = models.Role;
export const Vaccine = models.Vaccine;

export default models;
