const express = require("express");
const router = express.Router();

// Importando os controllers separados
const blocoController = require("../controllers/blocoController");
const banheiroController = require("../controllers/banheiroController");
const hospitalController = require("../controllers/hospitalController");

// Definição das rotas
router.get("/blocos", blocoController.getBlocos);
router.get("/banheiros", banheiroController.getBanheiros);
router.get("/hospitais", hospitalController.getHospitais);

module.exports = router;
