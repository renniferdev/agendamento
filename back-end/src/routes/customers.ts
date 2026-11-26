import { Router } from "express";
import { listEstablishmentCustomers } from "../lib/customerList";
import { requireAdmin } from "../middleware/requireAdmin";

export const customersRouter = Router();

customersRouter.use(requireAdmin);

/** GET /admin/customers — clientes do estabelecimento logado. */
customersRouter.get("/", async (req, res, next) => {
  try {
    // O estabelecimento vem sempre da sessão, nunca de parâmetros da requisição.
    res.json(await listEstablishmentCustomers(req.adminUser!.establishmentId));
  } catch (err) {
    next(err);
  }
});
