import { sequelize } from '../../config/database.js';
import UserModel from './User/UserModel.js';
import PetOwnerModel from './PetOwner/PetOwnerModel.js';
import PetOwnerPetModel from './PetOwner/PetOwnerModel.js';
import ClinicModel from './Clinic/ClinicModel.js';
import UserRoleModel from './User/UserRoleModel.js';
import PetModel from './Pet/PetModel.js';
import PetTypeModel from './Pet/PetTypeModel.js';
import PetBreedModel from './Pet/PetBreedModel.js';
import PetGenderModel from './Pet/PetGenderModel.js';
import PetColorModel from './Pet/PetColorModel.js';
import PetSizeModel from './Pet/PetSizeModel.js';
import PetFurTypeModel from './Pet/PetFurTypeModel.js';
import PetFurLengthModel from './Pet/PetFurLengthModel.js';
import PetTemperamentModel from './Pet/PetTemperamentModel.js';
import PetSocializationLevelModel from './Pet/PetSocializationLevelModel.js';
import PetLivingEnvironmentModel from './Pet/PetLivingEnvironmentModel.js';
import PetBloodTypeModel from './Pet/PetBloodTypeModel.js';
import VaccineModel from './Medications/VaccineModel.js';
import ProtocolModel from './Protocols/ProtocolModel.js';

const models = {
  User: UserModel(sequelize),
  UserRole: UserRoleModel(sequelize),
  PetOwner: PetOwnerModel(sequelize),
  PetOwnerPet: PetOwnerPetModel(sequelize),
  Clinic: ClinicModel(sequelize),
  Pet: PetModel(sequelize),
  PetType: PetTypeModel(sequelize),
  PetBreed: PetBreedModel(sequelize),
  PetGender: PetGenderModel(sequelize),
  PetColor: PetColorModel(sequelize),
  PetSize: PetSizeModel(sequelize),
  PetFurType: PetFurTypeModel(sequelize),
  PetFurLength: PetFurLengthModel(sequelize),
  PetTemperament: PetTemperamentModel(sequelize),
  PetSocializationLevel: PetSocializationLevelModel(sequelize),
  PetLivingEnvironment: PetLivingEnvironmentModel(sequelize),
  PetBloodType: PetBloodTypeModel(sequelize),
  Vaccine: VaccineModel(sequelize),
  Protocol: ProtocolModel(sequelize),
};

Object.keys(models).forEach((modelName) => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

export const User = models.User;
export const UserRole = models.UserRole;
export const PetOwner = models.PetOwner;
export const PetOwnerPet = models.PetOwnerPet;
export const Clinic = models.Clinic;
export const PetType = models.PetType;
export const Vaccine = models.Vaccine;
export const Protocol = models.Protocol;
export const Pet = models.Pet;
export const PetBreed = models.PetBreed;
export const PetGender = models.PetGender;
export const PetColor = models.PetColor;
export const PetSize = models.PetSize;
export const PetFurType = models.PetFurType;
export const PetFurLength = models.PetFurLength;
export const PetTemperament = models.PetTemperament;
export const PetSocializationLevel = models.PetSocializationLevel;
export const PetLivingEnvironment = models.PetLivingEnvironment;
export const PetBloodType = models.PetBloodType;

export default models;
