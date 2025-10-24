 Laboratorio 2 — Sistema Distribuido de Registro de Calificaciones

 Descripción general
Este proyecto implementa un sistema cliente-servidor distribuido en Python 3
para el registro de calificaciones finales de estudiantes.  
El sistema utiliza comunicación TCP con sockets, persistencia mediante archivos CSV, 
y se extiende con un microservicio de validación de NRCs (materias).

Componentes principales
1. Servidor de Calificaciones (sin hilos)  
   Atiende un cliente a la vez, realizando operaciones CRUD sobre `calificaciones.csv`.
2. Servidor de Calificaciones (con hilos)  
    Permite concurrencia mediante `threading`, con un `Lock` para mantener la consistencia del archivo.
3. Cliente interactivo
   Aplicación de consola que muestra un menú y se comunica con el servidor vía TCP.
4. Servidor de NRCs  
   Servicio independiente que valida códigos de materia (NRC) y responde a consultas del servidor principal.


