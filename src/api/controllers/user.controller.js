import { ADMIN_ROLE_ID, PET_OWNER_ROLE_ID, VETERINARY_ROLE_ID } from '../../constants/database.js';
import UserService from '../services/user.service.js';
import { validateUserCreate } from '../validators/user.validations.js';

const getAllUsers = async (_req, res) => {
  try {
    const users = await UserService.getAllUsers();
    return res.status(200).json({
      code: 'USERS_FETCHED',
      data: users,
    });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const getAllVeterinaries = async (_req, res) => {
  try {
    const veterinaries = await UserService.getAllVeterinaries();

    return res.status(200).json({
      code: 'VETERINARIES_FETCHED',
      data: veterinaries,
    });
  } catch (error) {
    console.error('Erro ao buscar veterinários:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const getAllPetOwners = async (_req, res) => {
  try {
    const petOwners = await UserService.getAllPetOwners();

    return res.status(200).json({
      code: 'PET_OWNERS_FETCHED',
      data: petOwners,
    });
  } catch (error) {
    console.error('Erro ao buscar tutores:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const getUserByEmail = async (req, res) => {
  try {
    console.log('EMAIL');
    const { email } = req.params;
    const user = await UserService.getUserByEmail({ email });

    return res.status(200).json({
      code: 'USER_FETCHED',
      data: user,
    });
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const getAllBathers = async (req, res) => {
  try {
    const clinic_id = req.headers['clinic_id'];
    console.log('CHEGOU', clinic_id);

    const bathers = await UserService.getAllBathers({ clinic_id });

    return res.status(200).json({
      code: 'USERS_FETCHED',
      data: bathers,
    });
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const getVeterinaryById = async (req, res) => {
  try {
    const { id } = req.params;
    const veterinary = await UserService.getVeterinaryById({ id });

    return res.status(200).json({
      code: 'VETERINARY_FETCHED',
      data: veterinary,
    });
  } catch (error) {
    console.error('Erro ao buscar veterinário:', error);
    if (error.message === 'Veterinary not found') {
      return res.status(404).json({
        code: 'VETERINARY_NOT_FOUND',
        message: 'Veterinário não encontrado',
      });
    }
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const getPetOwnerById = async (req, res) => {
  try {
    const { id } = req.params;
    const petOwner = await UserService.getPetOwnerById({ id });

    return res.status(200).json({
      code: 'PET_OWNER_FETCHED',
      data: petOwner,
    });
  } catch (error) {
    console.error('Erro ao buscar tutor:', error);
    if (error.message === 'Pet owner not found') {
      return res.status(404).json({
        code: 'PET_OWNER_NOT_FOUND',
        message: 'Tutor não encontrado',
      });
    }
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const createUser = async (req, res) => {
  try {
    const { error, value } = validateUserCreate(req.body);
    if (error) return res.status(400).json({ error: error.details });

    const { clinicId, ...restValue } = value;

    const newUser = await UserService.createUser({
      userData: {
        ...restValue,
        clinic_id: clinicId,
      },
    });

    if (!newUser) {
      throw new Error('User creation failed');
    }

    return res.status(201).json({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      clinicId: newUser.clinic_id,
    });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    return res.status(error.status || 500).json({
      code: error.code || 'USER_CREATION_ERROR',
      message: error.message || 'Erro ao criar usuário',
    });
  }
};

const createPetOwner = async (req, res) => {
  try {
    const { error, value } = validateUserCreate(req.body);
    if (error) return res.status(400).json({ error: error.details });

    const userData = {
      ...value,
      role_id: PET_OWNER_ROLE_ID,
      clinic_id: value.clinicId,
    };

    const newUser = await UserService.createPetOwner({ userData });

    return res.status(201).json({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      clinicId: newUser.clinic_id,
    });
  } catch (error) {
    console.error('Erro ao criar tutor:', error);
    return res.status(500).json({
      code: 'USER_CREATION_ERROR',
      message: error.message,
    });
  }
};

const createVeterinary = async (req, res) => {
  try {
    const { error, value } = validateUserCreate(req.body);
    if (error) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        error: error.details,
      });
    }

    const userData = {
      ...value,
      role_id: VETERINARY_ROLE_ID,
      clinic_id: value.clinicId,
    };

    const newUser = await UserService.createVeterinary({ userData });

    return res.status(201).json({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      clinicId: newUser.clinic_id,
    });
  } catch (error) {
    console.error('Erro ao criar veterinário:', error);

    return res.status(500).json({
      code: 'USER_CREATION_ERROR',
      message: `Erro ao criar veterinário: ${error.message}`,
    });
  }
};

const createAdmin = async (req, res) => {
  try {
    const { error, value } = validateUserCreate(req.body);
    if (error) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        error: error.details,
      });
    }

    const userData = {
      ...value,
      role_id: ADMIN_ROLE_ID,
      clinic_id: value.clinicId,
    };

    const newUser = await UserService.createAdmin({ userData });

    return res.status(201).json({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      clinicId: newUser.clinic_id,
    });
  } catch (error) {
    console.error('Erro ao criar admin:', error);

    return res.status(500).json({
      code: 'USER_CREATION_ERROR',
      message: `Erro ao criar admin: ${error.message}`,
    });
  }
};

export default {
  createUser,
  createPetOwner,
  createVeterinary,
  createAdmin,
  getAllVeterinaries,
  getAllPetOwners,
  getAllUsers,
  getUserByEmail,
  getAllBathers,
  getVeterinaryById,
  getPetOwnerById,
};
