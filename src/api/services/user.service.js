import { PET_OWNER_ROLE_ID, VETERINARY_ROLE_ID } from '../../constants/database.js';
import UserRepository from '../repositories/user.repository.js';
import bcrypt from 'bcryptjs';

const createUser = async ({ userData }) => {
  try {
    const validRoleIds = [VETERINARY_ROLE_ID, PET_OWNER_ROLE_ID];

    if (!validRoleIds.includes(userData.role_id)) {
      throw new Error('Invalid role_id. User must be either veterinary or pet owner');
    }

    await checkIfUserExists({ email: userData?.email });
    const hashedPassword = await hashPassword(userData.password);

    return await UserRepository.createUser({
      userData: { ...userData, password: hashedPassword },
    });
  } catch (error) {
    throw new Error(`Error creating user: ${error.message}`);
  }
};

const createVeterinary = async ({ userData }) => {
  try {
    await checkIfUserExists({ email: userData?.email });
    const hashedPassword = await hashPassword(userData.password);

    return await UserRepository.createVeterinary({
      userData: { ...userData, password: hashedPassword },
    });
  } catch (error) {
    throw new Error(`Error creating veterinary: ${error.message}`);
  }
};

const createPetOwner = async ({ userData }) => {
  try {
    await checkIfUserExists({ email: userData?.email });
    const hashedPassword = await hashPassword(userData.password);

    return await UserRepository.createPetOwner({
      userData: { ...userData, password: hashedPassword },
    });
  } catch (error) {
    throw new Error(`Error creating pet owner: ${error.message}`);
  }
};

const createAdmin = async ({ userData }) => {
  try {
    await checkIfUserExists({ email: userData?.email });
    const hashedPassword = await hashPassword(userData.password);

    return await UserRepository.createAdmin({
      userData: { ...userData, password: hashedPassword },
    });
  } catch (error) {
    throw new Error(`Error creating pet owner: ${error.message}`);
  }
};

const getAllVeterinaries = async () => {
  try {
    const veterinaries = await UserRepository.getAllVeterinaries();
    return veterinaries;
  } catch (error) {
    throw new Error(`Error getting veterinaries: ${error.message}`);
  }
};

const getAllPetOwners = async () => {
  try {
    const petOwners = await UserRepository.getAllPetOwners();
    return petOwners;
  } catch (error) {
    throw new Error(`Error getting pet owners: ${error.message}`);
  }
};

const getAllUsers = async () => {
  try {
    const users = await UserRepository.getAllUsers();
    return users;
  } catch (error) {
    throw new Error(`Error getting users: ${error.message}`);
  }
};

const getUserByEmail = async ({ email, password = false }) => {
  try {
    const user = await UserRepository.getUserByEmail({ email, password });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  } catch (error) {
    throw new Error(`Error getting user by email: ${error.message}`);
  }
};

const getAllBathers = async ({ clinic_id }) => {
  try {
    const bathers = await UserRepository.getAllBathers({ clinic_id });

    return bathers;
  } catch (error) {
    throw new Error(`Error fetching bathers: ${error.message}`);
  }
};

const getVeterinaryById = async ({ id }) => {
  try {
    const veterinary = await UserRepository.getVeterinaryById({ id });

    if (!veterinary) {
      throw new Error('Veterinary not found');
    }

    return veterinary;
  } catch (error) {
    throw new Error(`Error getting veterinary by id: ${error.message}`);
  }
};

const getPetOwnerById = async ({ id }) => {
  try {
    const petOwner = await UserRepository.getPetOwnerById({ id });

    if (!petOwner) {
      throw new Error('Pet owner not found');
    }

    return petOwner;
  } catch (error) {
    throw new Error(`Error getting pet owner by id: ${error.message}`);
  }
};

const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

const checkIfUserExists = async ({ email }) => {
  const user = await UserRepository.getUserByEmail({ email });

  if (user?.id) throw new Error('Error creating user: This email already exists');
};

export default {
  createUser,
  createVeterinary,
  createPetOwner,
  createAdmin,
  comparePassword,
  getAllVeterinaries,
  getAllPetOwners,
  getAllUsers,
  getAllBathers,
  getUserByEmail,
  getVeterinaryById,
  getPetOwnerById,
};
